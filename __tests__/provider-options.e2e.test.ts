// GET /providers/options: lista mínima de proveedores para los selectores, también para quien no
// puede ver la ficha completa (AGENTE_VENTAS). Requiere Postgres migrado (npm run test:e2e).
process.env.RATE_LIMIT_MAX = "100000";

jest.mock("../src/services/pdf.service", () => ({}));

import jwt from "jsonwebtoken";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require("../src/config/env");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../src/lib/prisma");

const tag = `popt-${Date.now()}`;
const MANY = 105;

describe("GET /providers/options (integración con Postgres)", () => {
  const u: Record<string, any> = {};

  beforeAll(async () => {
    u.admin = await prisma.user.create({ data: { email: `${tag}-a@example.com`, fullName: "A", passwordHash: "x", role: "ADMINISTRADOR" } });
    u.ventas = await prisma.user.create({ data: { email: `${tag}-v@example.com`, fullName: "V", passwordHash: "x", role: "USUARIO", agencyRole: "AGENTE_VENTAS" } });
    u.sinNada = await prisma.user.create({ data: { email: `${tag}-n@example.com`, fullName: "N", passwordHash: "x", role: "USUARIO", agencyRole: "AGENTE_VENTAS" } });
    await prisma.userPermission.createMany({
      data: ["VIEW_PROVIDERS", "VIEW_SERVICES", "VIEW_CONFIRMATIONS", "VIEW_VOUCHERS"].map((permission) => ({
        userId: u.sinNada.id, permission, effect: "DENY", grantedBy: u.admin.id,
      })),
    });
    await prisma.provider.createMany({
      data: Array.from({ length: MANY }, (_, i) => ({
        name: `${tag} Proveedor ${String(i).padStart(3, "0")}`, email: `${tag}-${i}@prov.cl`, rut: "76.000.000-0",
        bankAccount: "999888777", isActive: i !== 0,
      })),
    });
  });

  afterAll(async () => {
    await prisma.provider.deleteMany({ where: { name: { startsWith: tag } } });
    const ids = Object.values(u).map((x: any) => x.id);
    await prisma.userPermission.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  const get = (who: string, path: string) =>
    request(app).get(path).set("Authorization", `Bearer ${jwt.sign({ id: u[who].id, email: u[who].email, role: u[who].role }, env.JWT_SECRET)}`);

  it("ventas recibe todos los proveedores, sin paginar y solo con id, nombre y estado", async () => {
    const res = await get("ventas", "/api/providers/options");
    expect(res.status).toBe(200);
    const mine = res.body.data.filter((p: any) => p.name.startsWith(tag));
    expect(mine).toHaveLength(MANY);
    for (const p of mine) expect(Object.keys(p).sort()).toEqual(["fantasyName", "id", "isActive", "name"]);
    expect(mine.find((p: any) => p.name.endsWith("000")).isActive).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/999888777|@prov\.cl|76\.000\.000/);
  });

  it("ventas sigue sin acceso a la ficha completa", async () => {
    expect((await get("ventas", "/api/providers")).status).toBe(403);
  });

  it("sin ningún permiso de los módulos que usan proveedores, 403", async () => {
    expect((await get("sinNada", "/api/providers/options")).status).toBe(403);
  });

  it("sin sesión, 401", async () => {
    expect((await request(app).get("/api/providers/options")).status).toBe(401);
  });
});
