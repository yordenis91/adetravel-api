import "dotenv/config";
import bcrypt from "bcryptjs";
import { AgencyRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { resolveAdminCredentials } from "./seed-guard";

const fullName = process.env.ADMIN_FULL_NAME || "Administrador AdeTravel";
const agencyRole = (process.env.ADMIN_AGENCY_ROLE as AgencyRole) || AgencyRole.GERENTE;

async function main() {
  // Sin valores por defecto: un administrador con contraseña conocida sería una puerta abierta.
  const { email: normalizedEmail, password } = resolveAdminCredentials();
  const existingAdmin = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (existingAdmin) {
    console.log(`Usuario administrador ya existe: ${normalizedEmail}`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.create({
    data: {
      email: normalizedEmail,
      fullName,
      passwordHash,
      role: "ADMINISTRADOR",
      agencyRole,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  console.log(`Administrador creado: ${admin.email} (ID: ${admin.id})`);
  // La contraseña no se imprime: los logs del contenedor no deben contener credenciales.
}

main()
  .catch((error) => {
    console.error("Error creando el administrador:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
