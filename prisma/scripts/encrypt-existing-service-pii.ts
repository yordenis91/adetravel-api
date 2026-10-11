/**
 * Backfill ÚNICO: cifra passportNumber y rut dentro de services.details de los
 * servicios creados antes de activar src/lib/service-pii-extension.ts.
 *
 * Seguro de re-ejecutar: lo que ya tiene formato "v1:..." se salta.
 * Antes de correrlo en producción: PII_ENCRYPTION_KEY definida (la misma de la app),
 * backup de la base y una pasada con --dry-run.
 *
 *   npx ts-node prisma/scripts/encrypt-existing-service-pii.ts --dry-run
 *   npx ts-node prisma/scripts/encrypt-existing-service-pii.ts
 */
import { prisma } from "../../src/lib/prisma";
import { encryptPII, isEncryptedPII } from "../../src/lib/pii-encryption";
import { ENCRYPTED_SERVICE_DETAIL_KEYS } from "../../src/lib/service-pii-extension";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`Backfill de cifrado de PII en services.details${DRY_RUN ? " (DRY RUN)" : ""}...`);
  // Consulta cruda: lee el JSON tal como está guardado, sin pasar por la extensión.
  const rows = await prisma.$queryRaw<Array<{ id: string; details: Record<string, unknown> | null }>>`
    SELECT id, details FROM "services" ORDER BY id ASC
  `;
  let updated = 0;
  for (const row of rows) {
    if (!row.details || typeof row.details !== "object") continue;
    const next: Record<string, unknown> = { ...row.details };
    let changed = false;
    for (const key of ENCRYPTED_SERVICE_DETAIL_KEYS) {
      const value = next[key];
      if (typeof value === "string" && value !== "" && !isEncryptedPII(value)) {
        next[key] = encryptPII(value);
        changed = true;
      }
    }
    if (!changed) continue;
    updated++;
    if (!DRY_RUN) {
      await prisma.$executeRaw`UPDATE "services" SET details = ${JSON.stringify(next)}::jsonb WHERE id = ${row.id}`;
    }
  }
  console.log(`Servicios revisados: ${rows.length}. ${DRY_RUN ? "Se cifrarían" : "Cifrados"}: ${updated}.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
