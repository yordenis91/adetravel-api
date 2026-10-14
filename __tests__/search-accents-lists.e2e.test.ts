// Los buscadores de los listados (usuarios, proveedores, solicitudes, vouchers, bitácora) ignoran tildes y mayúsculas.
// Requiere Postgres migrado (npm run test:e2e).
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

const tag = `zl${process.pid}${Date.now()}`;

describe("búsqueda sin tildes en los listados (integración con Postgres)", () => {
  let admin: any;
  const rec: Record<string, any> = {};

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { email: `${tag}-a@example.com`, fullName: `Zoé Ñandú${tag}`, passwordHash: "x", role: "ADMINISTRADOR" } });
    rec.provider = await prisma.provider.create({ data: { name: `Agencia Málaga${tag}`, email: `${tag}@prov.cl` } });
    rec.client = await prisma.client.create({ data: { firstName: `Inés${tag}`, lastName: "Muñoz", email: `${tag}@cliente.cl` } });
    rec.request = await prisma.request.create({
      data: { requestNumber: `REQ-${tag}`, clientId: rec.client.id, destinationCity: "Lima", destinationCountry: `Perú${tag}` },
    });
    rec.voucher = await prisma.voucher.create({
      data: { voucherNumber: `VCH-${tag}`, requestId: rec.request.id, clientId: rec.client.id, serviceName: "Traslado", destination: "Cusco" },
    });
    rec.log = await prisma.activityLog.create({
      data: { action: "UPDATE", entityType: "CLIENT", entityId: rec.client.id, description: `Edición de Inés${tag}`, performedBy: `Ana Pérez${tag}` },
    });
  });

  afterAll(async () => {
    await prisma.activityLog.deleteMany({ where: { id: rec.log?.id } });
    await prisma.voucher.deleteMany({ where: { id: rec.voucher?.id } });
    await prisma.request.deleteMany({ where: { id: rec.request?.id } });
    await prisma.client.deleteMany({ where: { id: rec.client?.id } });
    await prisma.provider.deleteMany({ where: { id: rec.provider?.id } });
    await prisma.user.deleteMany({ where: { id: admin?.id } });
    await prisma.$disconnect();
  });

  const get = (path: string) =>
    request(app).get(path).set("Authorization", `Bearer ${jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, env.JWT_SECRET)}`);
  const list = async (path: string, q: string) => {
    const { body } = await get(`${path}?search=${encodeURIComponent(q)}&limit=50`);
    return (body.data ?? []) as any[];
  };

  it("usuarios: 'zoe nandu' encuentra 'Zoé Ñandú'", async () => {
    expect((await list("/api/users", `zoe nandu${tag}`)).map((u) => u.id)).toContain(admin.id);
    expect((await list("/api/users", `ZOÉ ÑANDÚ${tag}`)).map((u) => u.id)).toContain(admin.id);
  });

  it("proveedores: 'malaga' encuentra 'Málaga'", async () => {
    expect((await list("/api/providers", `malaga${tag}`)).map((p) => p.id)).toContain(rec.provider.id);
  });

  it("solicitudes: el país de destino sin tilde", async () => {
    expect((await list("/api/requests", `peru${tag}`)).map((r) => r.id)).toContain(rec.request.id);
  });

  it("vouchers: por el nombre del cliente sin tilde", async () => {
    expect((await list("/api/vouchers", `ines${tag}`)).map((v) => v.id)).toContain(rec.voucher.id);
  });

  it("bitácora: búsqueda y filtro por autor sin tildes", async () => {
    expect((await list("/api/activity-logs", `edicion de ines${tag}`)).map((l) => l.id)).toContain(rec.log.id);
    const byAuthor = await get(`/api/activity-logs?performedBy=${encodeURIComponent(`ana perez${tag}`)}&limit=50`);
    expect((byAuthor.body.data as any[]).map((l) => l.id)).toContain(rec.log.id);
  });

  it("un término que no existe no devuelve nada", async () => {
    expect(await list("/api/providers", `nada-${tag}-xyz`)).toHaveLength(0);
  });
});
