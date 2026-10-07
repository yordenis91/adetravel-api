/**
 * Rota PII_ENCRYPTION_KEY (ver PII_ENCRYPTION.md, "Rotar la clave"). Lee las claves del entorno:
 *   PII_ENCRYPTION_KEY_OLD  la vigente
 *   PII_ENCRYPTION_KEY_NEW  la nueva (openssl rand -hex 32)
 *
 *   npx ts-node prisma/scripts/rotate-pii-key.ts --dry-run   # solo cuenta, no escribe
 *   npx ts-node prisma/scripts/rotate-pii-key.ts
 */
import { rotatePiiKey } from "../../src/ops/rotate-pii-key";

const dryRun = process.argv.includes("--dry-run");

rotatePiiKey({
  databaseUrl: process.env.DATABASE_URL ?? "",
  oldKey: process.env.PII_ENCRYPTION_KEY_OLD ?? "",
  newKey: process.env.PII_ENCRYPTION_KEY_NEW ?? "",
  dryRun,
})
  .then((r) => {
    console.log(`Valores revisados: ${r.scanned}`);
    console.log(`  con la clave vieja (a rotar): ${r.toRotate}`);
    console.log(`  ya con la clave nueva: ${r.alreadyNew}`);
    console.log(`  en texto plano (no se tocan; usar pii:encrypt-backfill): ${r.plaintext}`);
    console.log(dryRun ? "Simulación: no se escribió nada." : `Rotados: ${r.rotated}. Ahora cambia PII_ENCRYPTION_KEY en Easypanel por la nueva.`);
  })
  .catch((e) => {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  });
