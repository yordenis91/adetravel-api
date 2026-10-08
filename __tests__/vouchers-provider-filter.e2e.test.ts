// GET /vouchers?providerId=: la ficha del proveedor solo debe ver sus vouchers (antes el filtro se
// ignoraba y aparecían los de todos). Requiere Postgres migrado (npm run test:e2e).
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

const tag = `vpf-${Date.now()}`;

describe("GET /vouchers?providerId (integración con Postgres)", () => {
  const rec: Record<string, any> = {};

  beforeAll(async () => {
    rec.admin = await prisma.user.create({ data: { email: `${tag}@example.com`, fullName: "A", passwordHash: "x", role: "ADMINISTRADOR" } });
    rec.client = await prisma.client.create({ data: { firstName: "Filtro", lastName: "Proveedor" } });
    rec.request = await prisma.request.create({ data: { requestNumber: `${tag}-R`, clientId: rec.client.id } });
    rec.p1 = await prisma.provider.create({ data: { name: `${tag} Uno` } });
    rec.p2 = await prisma.provider.create({ data: { name: `${tag} Dos` } });
    for (const [i, p] of [rec.p1, rec.p1, rec.p2].entries()) {
      await prisma.voucher.create({ data: { voucherNumber: `${tag}-V${i}`, requestId: rec.request.id, clientId: rec.client.id, providerId: p.id } });
    }
  });

  afterAll(async () => {
    await prisma.voucher.deleteMany({ where: { requestId: rec.request?.id } });
    await prisma.request.deleteMany({ where: { id: rec.request?.id } });
    await prisma.provider.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.client.deleteMany({ where: { id: rec.client?.id } });
    await prisma.user.deleteMany({ where: { id: rec.admin?.id } });
    await prisma.$disconnect();
  });

  const get = (qs: string) =>
    request(app).get(`/api/vouchers?${qs}`).set("Authorization", `Bearer ${jwt.sign({ id: rec.admin.id, email: rec.admin.email, role: rec.admin.role }, env.JWT_SECRET)}`);

  it("devuelve solo los vouchers del proveedor", async () => {
    const res = await get(`providerId=${rec.p1.id}&limit=100`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data.every((v: any) => v.providerId === rec.p1.id)).toBe(true);
  });

  it("rechaza un providerId que no es uuid", async () => {
    expect((await get("providerId=abc")).status).toBe(400);
  });
});
