import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { resolveAdminCredentials } from "../utils/admin-credentials";

/**
 * Crea el primer administrador. A diferencia de `prisma/seed-admin.ts`, está compilado en `dist`,
 * así que corre dentro de la imagen de producción (que no trae ts-node):
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create
 * Idempotente: si el correo ya existe no hace nada. La contraseña nunca se imprime.
 */
async function main(): Promise<void> {
  const { email, password } = resolveAdminCredentials();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`El administrador ya existe: ${email}`);
    return;
  }

  const admin = await prisma.user.create({
    data: {
      email,
      fullName: process.env.ADMIN_FULL_NAME || "Administrador AdeTravel",
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMINISTRADOR",
      agencyRole: "GERENTE",
      isActive: true
    }
  });
  console.log(`Administrador creado: ${admin.email} (ID: ${admin.id})`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
