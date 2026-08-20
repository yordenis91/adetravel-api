import { prisma } from "../src/lib/prisma";

/**
 * Todos los seeds de datos de negocio (clientes, proveedores, flujo) se insertan "como si los
 * hubiera cargado el administrador": createdBy = admin.id y con su propia entrada en Bitácora.
 */
export async function getAdminUser() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMINISTRADOR" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    throw new Error(
      "No existe ningún usuario ADMINISTRADOR. Ejecuta primero: npm run seed:admin"
    );
  }
  return admin;
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

export function toDateInput(d: Date): string {
  return d.toISOString().split("T")[0];
}
