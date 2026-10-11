import { Client } from "pg";
import { decryptPII, encryptPII, isEncryptedPII } from "../lib/pii-encryption";
import { ENCRYPTED_SERVICE_DETAIL_KEYS } from "../lib/service-pii-extension";

/**
 * Rotación de PII_ENCRYPTION_KEY: vuelve a cifrar con la clave nueva todo lo que está cifrado con la
 * vieja (pasaporte, cuenta y titular bancarios de clientes; contraseña SMTP de la configuración).
 *
 * - Antes de escribir comprueba que TODO lo cifrado se descifra con la vieja (o ya con la nueva, si
 *   una ejecución anterior se cortó); si algo no se descifra con ninguna, aborta sin tocar nada.
 * - Escribe en una sola transacción y vuelve a verificar con la nueva antes de confirmar.
 * - Es idempotente: lo que ya está con la clave nueva se salta.
 * Usa `pg` directamente: la extensión de Prisma cifraría/descifraría con la clave del entorno.
 */
export interface RotationReport {
  scanned: number;
  toRotate: number;
  alreadyNew: number;
  plaintext: number;
  undecryptable: number;
  rotated: number;
  dryRun: boolean;
}

interface Target {
  table: string;
  columns: string[];
  // Claves cifradas dentro de una columna JSON (p. ej. services.details).
  jsonKeys?: Record<string, readonly string[]>;
}

interface Slot {
  column: string;
  jsonKey?: string;
  value: string | null;
}

const TARGETS: Target[] = [
  { table: "clients", columns: ["passportNumber", "bankAccount", "bankAccountHolder"] },
  { table: "system_config", columns: ["smtpPassword"] },
  { table: "services", columns: [], jsonKeys: { details: ENCRYPTED_SERVICE_DETAIL_KEYS } },
];

const selectList = (t: Target) => [...t.columns, ...Object.keys(t.jsonKeys ?? {})].map((c) => `"${c}"`).join(", ");

// Valores cifrables de una fila: columnas directas y claves dentro de columnas JSON.
function slotsOf(t: Target, row: Record<string, any>): Slot[] {
  const slots: Slot[] = t.columns.map((column) => ({ column, value: row[column] as string | null }));
  for (const [column, keys] of Object.entries(t.jsonKeys ?? {})) {
    const json = row[column];
    if (!json || typeof json !== "object") continue;
    for (const jsonKey of keys) {
      const v = json[jsonKey];
      if (typeof v === "string") slots.push({ column, jsonKey, value: v });
    }
  }
  return slots;
}

const decryptsWith = (value: string, keyHex: string) => {
  const out = decryptPII(value, keyHex);
  return out !== null && out !== value && !isEncryptedPII(out) ? out : null;
};

const validKey = (hex: string) => /^[0-9a-fA-F]{64}$/.test(hex);

export async function rotatePiiKey(options: {
  databaseUrl: string;
  oldKey: string;
  newKey: string;
  dryRun?: boolean;
}): Promise<RotationReport> {
  const { oldKey, newKey, dryRun = false } = options;
  if (!validKey(oldKey) || !validKey(newKey)) throw new Error("Las claves deben ser hex de 64 caracteres");
  if (oldKey.toLowerCase() === newKey.toLowerCase()) throw new Error("La clave nueva es igual a la vieja");

  const db = new Client({ connectionString: options.databaseUrl.replace(/[?&]schema=[^&]*/, "") });
  await db.connect();
  const report: RotationReport = { scanned: 0, toRotate: 0, alreadyNew: 0, plaintext: 0, undecryptable: 0, rotated: 0, dryRun };
  const updates: Array<{ table: string; column: string; jsonKey?: string; id: string; value: string }> = [];

  try {
    for (const target of TARGETS) {
      const { table } = target;
      const exists = (await db.query(`SELECT to_regclass($1) AS r`, [`public.${table}`])).rows[0].r;
      if (!exists) continue;
      const rows = (await db.query(`SELECT id, ${selectList(target)} FROM "${table}"`)).rows;
      for (const row of rows) {
        for (const { column, jsonKey, value } of slotsOf(target, row)) {
          if (!value) continue;
          report.scanned++;
          if (!isEncryptedPII(value)) {
            report.plaintext++;
            continue;
          }
          if (decryptsWith(value, newKey) !== null) {
            report.alreadyNew++;
            continue;
          }
          const plain = decryptsWith(value, oldKey);
          if (plain === null) {
            report.undecryptable++;
            continue;
          }
          report.toRotate++;
          updates.push({ table, column, jsonKey, id: row.id, value: encryptPII(plain, newKey)! });
        }
      }
    }

    if (report.undecryptable > 0) {
      throw new Error(`${report.undecryptable} valor(es) no se descifran ni con la clave vieja ni con la nueva: no se toca nada`);
    }
    if (dryRun || updates.length === 0) return report;

    await db.query("BEGIN");
    try {
      for (const u of updates) {
        if (u.jsonKey) {
          await db.query(`UPDATE "${u.table}" SET "${u.column}" = jsonb_set("${u.column}"::jsonb, ARRAY[$1]::text[], to_jsonb($2::text)) WHERE id = $3`, [u.jsonKey, u.value, u.id]);
        } else {
          await db.query(`UPDATE "${u.table}" SET "${u.column}" = $1 WHERE id = $2`, [u.value, u.id]);
        }
      }
      // Verificación dentro de la transacción: todo lo cifrado debe descifrarse con la nueva.
      for (const target of TARGETS) {
        const { table } = target;
        const exists = (await db.query(`SELECT to_regclass($1) AS r`, [`public.${table}`])).rows[0].r;
        if (!exists) continue;
        const rows = (await db.query(`SELECT ${selectList(target)} FROM "${table}"`)).rows;
        for (const row of rows) {
          for (const { column, value: v } of slotsOf(target, row)) {
            if (v && isEncryptedPII(v) && decryptsWith(v, newKey) === null) {
              throw new Error(`Verificación fallida en ${table}.${column}: se deshace la rotación`);
            }
          }
        }
      }
      await db.query("COMMIT");
      report.rotated = updates.length;
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
    return report;
  } finally {
    await db.end();
  }
}
