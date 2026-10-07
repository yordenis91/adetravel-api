/**
 * Cifra la contraseña del SMTP guardada en SystemConfig si todavía está en texto plano
 * (configuraciones creadas antes de cifrarla). Seguro de re-ejecutar: si ya está cifrada,
 * no hace nada. Usa PII_ENCRYPTION_KEY: debe ser la misma que usa la app.
 *
 * Uso:
 *   npx ts-node prisma/scripts/encrypt-smtp-password.ts --dry-run
 *   npx ts-node prisma/scripts/encrypt-smtp-password.ts
 */
import { prisma } from "../../src/lib/prisma";
import { encryptPII, isEncryptedPII } from "../../src/lib/pii-encryption";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const configs = await prisma.systemConfig.findMany({ select: { id: true, smtpPassword: true } });
  const pending = configs.filter((c) => c.smtpPassword && !isEncryptedPII(c.smtpPassword));
  console.log(`Configuraciones: ${configs.length}. Con contraseña SMTP en texto plano: ${pending.length}.`);
  if (DRY_RUN || pending.length === 0) return;
  for (const c of pending) {
    await prisma.systemConfig.update({ where: { id: c.id }, data: { smtpPassword: encryptPII(c.smtpPassword) } });
  }
  console.log(`Cifradas: ${pending.length}.`);
}

main()
  .catch((error) => {
    console.error("Error cifrando la contraseña del SMTP:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
