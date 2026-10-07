// El cliente incrustado en pagos, cotizaciones, vouchers y servicios solo llega completo a quien
// tiene VIEW_CLIENTS (clientVisibility). Requiere Postgres migrado (npm run test:e2e).
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

const tag = `emb-${Date.now()}`;
const SENSITIVE = { passportNumber: "PX998877", bankAccount: "123450000", bankAccountHolder: "Titular Emb" };

describe("cliente incrustado en otros módulos según VIEW_CLIENTS (integración con Postgres)", () => {
  const u: Record<string, any> = {};
  const rec: Record<string, any> = {};

  beforeAll(async () => {
    u.admin = await prisma.user.create({ data: { email: `${tag}-a@example.com`, fullName: "A", passwordHash: "x", role: "ADMINISTRADOR" } });
    u.ops = await prisma.user.create({ data: { email: `${tag}-o@example.com`, fullName: "O", passwordHash: "x", role: "USUARIO", agencyRole: "OPERACIONES" } });
    u.limited = await prisma.user.create({ data: { email: `${tag}-l@example.com`, fullName: "L", passwordHash: "x", role: "USUARIO", agencyRole: "OPERACIONES" } });
    await prisma.userPermission.create({ data: { userId: u.limited.id, permission: "VIEW_CLIENTS", effect: "DENY", grantedBy: u.admin.id } });

    rec.client = await prisma.client.create({ data: { firstName: "Emb", lastName: "Prueba", email: `${tag}@cliente.cl`, phone: "+56911111111", ...SENSITIVE } });
    rec.request = await prisma.request.create({ data: { requestNumber: `REQ-${tag}`, clientId: rec.client.id } });
    rec.payment = await prisma.payment.create({
      data: { paymentNumber: `PAG-${tag}`, requestId: rec.request.id, clientId: rec.client.id, amount: 1, currency: "CLP", method: "EFECTIVO", status: "PENDIENTE" },
    });
    rec.quotation = await prisma.quotation.create({ data: { quotationNumber: `COT-${tag}`, requestId: rec.request.id, clientId: rec.client.id } });
    rec.voucher = await prisma.voucher.create({ data: { voucherNumber: `VCH-${tag}`, requestId: rec.request.id, clientId: rec.client.id } });
    rec.service = await prisma.service.create({
      data: { serviceNumber: `SRV-${tag}`, requestId: rec.request.id, clientId: rec.client.id, type: "SEGURO", details: {} },
    });
  });

  afterAll(async () => {
    await prisma.service.deleteMany({ where: { id: rec.service?.id } });
    await prisma.voucher.deleteMany({ where: { id: rec.voucher?.id } });
    await prisma.quotation.deleteMany({ where: { id: rec.quotation?.id } });
    await prisma.payment.deleteMany({ where: { id: rec.payment?.id } });
    await prisma.request.deleteMany({ where: { id: rec.request?.id } });
    await prisma.client.deleteMany({ where: { id: rec.client?.id } });
    const ids = Object.values(u).map((x: any) => x.id);
    await prisma.userPermission.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  const get = (who: string, path: string) =>
    request(app).get(path).set("Authorization", `Bearer ${jwt.sign({ id: u[who].id, email: u[who].email, role: u[who].role }, env.JWT_SECRET)}`);

  // [módulo, listado, clave del registro creado]
  const MODULES: Array<[string, string, string]> = [
    ["pagos", "/api/payments?limit=100", "payment"],
    ["cotizaciones", "/api/quotations?limit=100", "quotation"],
    ["vouchers", "/api/vouchers?limit=100", "voucher"],
    ["servicios", "/api/services?limit=100", "service"],
  ];

  const clientIn = (body: any, id: string) => {
    const data = body.data ?? body;
    const item = Array.isArray(data) ? data.find((r: any) => r.id === id) : data;
    return item?.client;
  };

  describe.each(MODULES)("%s", (_name, listPath, key) => {
    const detailPath = () => `${listPath.split("?")[0]}/${rec[key].id}`;

    it("sin VIEW_CLIENTS: el listado y el detalle no traen datos sensibles del cliente", async () => {
      for (const path of [listPath, detailPath()]) {
        const res = await get("limited", path);
        expect([path, res.status]).toEqual([path, 200]);
        const text = JSON.stringify(res.body);
        for (const value of Object.values(SENSITIVE)) expect([path, text.includes(value)]).toEqual([path, false]);
        expect([path, text.includes(`${tag}@cliente.cl`)]).toEqual([path, false]);
        const c = clientIn(res.body, rec[key].id);
        if (c) for (const k of Object.keys(c)) expect(["id", "firstName", "lastName"]).toContain(k);
      }
    });

    it("con VIEW_CLIENTS: el detalle trae el cliente completo", async () => {
      const res = await get("ops", detailPath());
      expect(res.status).toBe(200);
      const c = clientIn(res.body, rec[key].id);
      expect(c).toBeDefined();
      expect(c.passportNumber).toBe(SENSITIVE.passportNumber);
    });
  });
});
