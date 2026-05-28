import "dotenv/config";
import bcrypt from "bcryptjs";
import { AgencyRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const email = process.env.ADMIN_EMAIL || "admin@adetravel.local";
const password = process.env.ADMIN_PASSWORD || "Admin123!";
const fullName = process.env.ADMIN_FULL_NAME || "Administrador AdeTravel";
const agencyRole = (process.env.ADMIN_AGENCY_ROLE as AgencyRole) || AgencyRole.GERENTE;

async function main() {
  const normalizedEmail = email.toLowerCase().trim();
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
  console.log(`Contraseña inicial: ${password}`);
}

main()
  .catch((error) => {
    console.error("Error creando el administrador:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
