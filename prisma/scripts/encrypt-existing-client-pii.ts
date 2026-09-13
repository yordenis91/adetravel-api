/**
 * Backfill ÚNICO: cifra en reposo el passportNumber/bankAccount/
 * bankAccountHolder de los Client ya existentes en la base de datos
 * (creados antes de que se activara el cifrado transparente en
 * src/lib/client-pii-extension.ts).
 *
 * A partir de que ese extension queda activo, cualquier Client NUEVO o
 * EDITADO ya se cifra automáticamente. Este script es solo para poner al
 * día los registros históricos.
 *
 * SEGURO DE RE-EJECUTAR: cada campo se cifra a lo sumo una vez — si ya
 * tiene el formato "v1:...:...:..." se salta. Se puede correr varias veces
 * sin duplicar el cifrado.
 *
 * ⚠️ ANTES DE CORRER ESTO EN PRODUCCIÓN:
 *   1. Confirmá que PII_ENCRYPTION_KEY ya está seteada en el entorno (la
 *      misma clave que usará la app en adelante — si esto se corre con una
 *      clave y la app arranca con otra, los datos quedan ilegibles).
 *   2. Hacé un backup de la base de datos. Esto reescribe columnas de la
 *      tabla "clients" y, aunque el script es cuidadoso, es una migración
 *      de datos real.
 *   3. Corré primero con --dry-run para ver cuántas filas se tocarían,
 *      sin escribir nada todavía.
 *
 * Uso:
 *   npx ts-node prisma/scripts/encrypt-existing-client-pii.ts --dry-run
 *   npx ts-node prisma/scripts/encrypt-existing-client-pii.ts
 */
import { prisma } from "../../src/lib/prisma";
import { isEncryptedPII } from "../../src/lib/pii-encryption";

const BATCH_SIZE = 200;
const DRY_RUN = process.argv.includes("--dry-run");

const FIELDS = ["passportNumber", "bankAccount", "bankAccountHolder"] as const;
type Field = (typeof FIELDS)[number];

interface RawClientRow {
  id: string;
  passportNumber: string | null;
  bankAccount: string | null;
  bankAccountHolder: string | null;
}

async function main() {
  console.log(`Iniciando backfill de cifrado de PII de clientes${DRY_RUN ? " (DRY RUN, no se escribe nada)" : ""}...`);

  let cursor: string | undefined;
  let scanned = 0;
  let updated = 0;
  const perFieldCounts: Record<Field, number> = { passportNumber: 0, bankAccount: 0, bankAccountHolder: 0 };

  for (;;) {
    // Consulta RAW: evita pasar por la extensión de Prisma para leer el
    // valor tal cual está guardado en la columna (texto plano o ya cifrado).
    const rows: RawClientRow[] = cursor
      ? await prisma.$queryRaw`
          SELECT id, "passportNumber", "bankAccount", "bankAccountHolder"
          FROM "clients"
          WHERE id > ${cursor}
          ORDER BY id ASC
          LIMIT ${BATCH_SIZE}
        `
      : await prisma.$queryRaw`
          SELECT id, "passportNumber", "bankAccount", "bankAccountHolder"
          FROM "clients"
          ORDER BY id ASC
          LIMIT ${BATCH_SIZE}
        `;

    if (rows.length === 0) break;

    for (const row of rows) {
      scanned++;
      const fieldsToEncrypt: Partial<Record<Field, string>> = {};

      for (const field of FIELDS) {
        const value = row[field];
        if (value && !isEncryptedPII(value)) {
          fieldsToEncrypt[field] = value;
          perFieldCounts[field]++;
        }
      }

      if (Object.keys(fieldsToEncrypt).length === 0) continue;

      updated++;
      if (DRY_RUN) {
        console.log(`[dry-run] Cliente ${row.id}: se cifraría ${Object.keys(fieldsToEncrypt).join(", ")}`);
        continue;
      }

      // Pasa por el cliente EXTENDIDO (src/lib/prisma.ts): al hacer update()
      // con el propio valor en texto plano, la extensión lo cifra antes de
      // escribirlo. No se puede usar $executeRaw aquí porque necesitamos
      // exactamente esa lógica de cifrado, no reimplementarla.
      await prisma.client.update({
        where: { id: row.id },
        data: fieldsToEncrypt
      });
    }

    cursor = rows[rows.length - 1].id;
  }

  console.log("\nResumen:");
  console.log(`  Clientes escaneados: ${scanned}`);
  console.log(`  Clientes ${DRY_RUN ? "a actualizar" : "actualizados"}: ${updated}`);
  for (const field of FIELDS) {
    console.log(`    - ${field}: ${perFieldCounts[field]}`);
  }
  if (DRY_RUN) {
    console.log("\nEsto fue un dry-run: no se escribió nada. Corré sin --dry-run para aplicar el cifrado.");
  }
}

main()
  .catch((error) => {
    console.error("Error en el backfill de cifrado de PII:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
