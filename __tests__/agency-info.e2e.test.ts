// GET /api/system-config/agency: lo lee cualquier usuario autenticado, pero solo trae datos públicos de la
// agencia; la configuración completa sigue exigiendo MANAGE_SYSTEM_CONFIG. Requiere Postgres migrado.
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

const tag = `agi-${process.pid}-${Date.now()}`;

describe("datos públicos de la agencia (integración con Postgres)", () => {
  let user: any;

  beforeAll(async () => {
    user = await prisma.user.create({
      data: { email: `${tag}@example.com`, fullName: "Agente", passwordHash: "x", role: "USUARIO", agencyRole: "AGENTE_VENTAS" },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: user?.id } });
    await prisma.$disconnect();
  });

  const get = (path: string, withToken = true) => {
    const r = request(app).get(path);
    return withToken ? r.set("Authorization", `Bearer ${jwt.sign({ id: user.id, email: user.email, role: user.role }, env.JWT_SECRET)}`) : r;
  };

  it("un usuario sin permiso de configuración puede leer los datos de la agencia", async () => {
    const res = await get("/api/system-config/agency");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(["address", "email", "name", "phone", "rut", "website"]);
    expect(typeof res.body.data.name).toBe("string");
    expect(res.body.data.name.length).toBeGreaterThan(0);
  });

  it("no filtra nada de la configuración privada", async () => {
    const body = JSON.stringify((await get("/api/system-config/agency")).body);
    for (const secret of ["smtp", "Password", "exchange", "PII"]) expect(body).not.toContain(secret);
  });

  it("la configuración completa sigue protegida para ese mismo usuario", async () => {
    expect((await get("/api/system-config")).status).toBe(403);
  });

  it("sin sesión responde 401", async () => {
    expect((await get("/api/system-config/agency", false)).status).toBe(401);
  });
});
