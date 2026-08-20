import "dotenv/config";
import bcrypt from "bcryptjs";
import { AgencyRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

// Usuarios adicionales (uno por cada AgencyRole) para probar el RBAC de verdad — el admin
// (seed-admin.ts) siempre pasa todos los permisos (bypass), así que sin estos usuarios no se
// puede verificar qué ve/puede hacer realmente cada rol de agencia. Incluye uno inactivo para
// probar el bloqueo por `isActive`.
const DEFAULT_PASSWORD = process.env.SEED_USERS_PASSWORD || "Agencia123!";

const users: { email: string; fullName: string; agencyRole: AgencyRole; isActive?: boolean; department?: string }[] = [
  { email: "finanzas@adetravel.local", fullName: "Ana Belén Torres", agencyRole: "FINANZAS", department: "Finanzas" },
  { email: "operaciones@adetravel.local", fullName: "Cristóbal Muñoz Reyes", agencyRole: "OPERACIONES", department: "Operaciones" },
  { email: "ventas1@adetravel.local", fullName: "Isidora Pacheco Vidal", agencyRole: "AGENTE_VENTAS", department: "Ventas" },
  { email: "ventas2@adetravel.local", fullName: "Tomás Bravo Espinoza", agencyRole: "AGENTE_VENTAS", department: "Ventas" },
  // Inactivo a propósito: sirve para probar que el login/RBAC bloquea correctamente a un
  // usuario desactivado (mensaje "Tu cuenta ha sido desactivada", ver auth.middleware.ts).
  { email: "exagente@adetravel.local", fullName: "Rodrigo Salinas Peña", agencyRole: "AGENTE_VENTAS", isActive: false, department: "Ventas" },
];

async function main() {
  console.log("🌱 Iniciando seed de usuarios de agencia...");
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`✓ Usuario ya existe: ${u.email}`);
      continue;
    }

    const created = await prisma.user.create({
      data: {
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        role: "USUARIO",
        agencyRole: u.agencyRole,
        department: u.department,
        isActive: u.isActive ?? true,
      },
    });

    console.log(`✅ Usuario creado: ${created.email} (${created.agencyRole}${u.isActive === false ? ", INACTIVO" : ""})`);
  }

  console.log(`🎉 Seed de usuarios completado. Contraseña para todos: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("❌ Error durante seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
