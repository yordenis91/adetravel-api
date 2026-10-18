// Correos adicionales de clientes y proveedores contra Postgres real: se guardan, se validan,
// no se pierden al editar otros campos y se devuelven en detalle y lista.
// Requiere Postgres migrado (npm run test:e2e).
process.env.RATE_LIMIT_MAX = "100000";
process.env.EMAIL_DELIVERY = "off";

jest.mock("../src/services/pdf.service", () => ({}));

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require("../src/config/env");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../src/lib/prisma");

const tag = `ae${process.pid}${Date.now()}`;

describe("correos adicionales de clientes y proveedores (integración con Postgres)", () => {
  let admin: { id: string; email: string; role: string };
  const auth = () => ({ Authorization: `Bearer ${jwt.sign({ id: admin.id, email: admin.email, role: admin.role, tv: 0 }, env.JWT_SECRET)}` });
  const clientIds: string[] = [];
  const providerIds: string[] = [];

  beforeAll(async () => {
    admin = await prisma.user.create({
      data: { email: `${tag}-admin@example.com`, fullName: "Admin correos", passwordHash: await bcrypt.hash("Inicial-2026!", 4), role: "ADMINISTRADOR" },
    });
  });

  afterAll(async () => {
    await prisma.activityLog.deleteMany({ where: { entityId: { in: [...clientIds, ...providerIds] } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.provider.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.activityLog.deleteMany({ where: { entityId: admin.id } });
    await prisma.user.deleteMany({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  describe("clientes", () => {
    const create = (extra: Record<string, unknown> = {}, n = Math.random().toString(36).slice(2, 7)) =>
      request(app).post("/api/clients").set(auth()).send({ firstName: "Lucía", lastName: `Navarro ${tag}`, email: `${tag}-${n}@example.com`, ...extra });

    it("sin enviarlos, el cliente nuevo queda con lista vacía", async () => {
      const res = await create();
      expect(res.status).toBe(201);
      clientIds.push(res.body.data.id);
      expect(res.body.data.additionalEmails).toEqual([]);
    });

    it("guarda los correos adicionales limpios y sin repetidos, y el detalle los devuelve", async () => {
      const res = await create({ additionalEmails: [" Contabilidad@Example.com ", "", "contabilidad@example.com", "viajes@example.com"] });
      expect(res.status).toBe(201);
      clientIds.push(res.body.data.id);
      expect(res.body.data.additionalEmails).toEqual(["Contabilidad@Example.com", "viajes@example.com"]);

      const detail = await request(app).get(`/api/clients/${res.body.data.id}`).set(auth());
      expect(detail.status).toBe(200);
      expect(detail.body.data.additionalEmails).toEqual(["Contabilidad@Example.com", "viajes@example.com"]);

      const list = await request(app).get("/api/clients").query({ search: tag }).set(auth());
      const row = list.body.data.find((c: { id: string }) => c.id === res.body.data.id);
      expect(row.additionalEmails).toEqual(["Contabilidad@Example.com", "viajes@example.com"]);
    });

    it("rechaza correos mal escritos y más de 10", async () => {
      const bad = await create({ additionalEmails: ["no-es-correo"] });
      expect(bad.status).toBe(400);
      const many = await create({ additionalEmails: Array.from({ length: 11 }, (_, i) => `p${i}@example.com`) });
      expect(many.status).toBe(400);
    });

    it("al editar otros campos no se pierden; al enviar la lista se reemplaza; vacía la deja sin correos", async () => {
      const res = await create({ additionalEmails: ["a@example.com", "b@example.com"] });
      const id = res.body.data.id;
      clientIds.push(id);

      const rename = await request(app).patch(`/api/clients/${id}`).set(auth()).send({ firstName: "Otra" });
      expect(rename.status).toBe(200);
      expect(rename.body.data.additionalEmails).toEqual(["a@example.com", "b@example.com"]);

      const replace = await request(app).patch(`/api/clients/${id}`).set(auth()).send({ additionalEmails: ["c@example.com"] });
      expect(replace.body.data.additionalEmails).toEqual(["c@example.com"]);

      const bad = await request(app).patch(`/api/clients/${id}`).set(auth()).send({ additionalEmails: ["nope"] });
      expect(bad.status).toBe(400);
      expect((await prisma.client.findUnique({ where: { id } })).additionalEmails).toEqual(["c@example.com"]);

      const clear = await request(app).patch(`/api/clients/${id}`).set(auth()).send({ additionalEmails: [] });
      expect(clear.body.data.additionalEmails).toEqual([]);
    });

    it("los correos adicionales no cuentan para el duplicado de email principal", async () => {
      const shared = `${tag}-compartido@example.com`;
      const first = await create({ additionalEmails: [shared] });
      clientIds.push(first.body.data.id);
      const second = await create({ email: shared });
      expect(second.status).toBe(201);
      clientIds.push(second.body.data.id);
    });
  });

  describe("proveedores", () => {
    const create = (extra: Record<string, unknown> = {}) =>
      request(app).post("/api/providers").set(auth()).send({ name: `Hotel ${tag}`, email: `${tag}@prov.cl`, ...extra });

    it("sin enviarlos, el proveedor nuevo queda con lista vacía", async () => {
      const res = await create();
      expect(res.status).toBe(201);
      providerIds.push(res.body.data.id);
      expect(res.body.data.additionalEmails).toEqual([]);
    });

    it("guarda los correos adicionales y el detalle y la lista los devuelven", async () => {
      const res = await create({ additionalEmails: ["pagos@prov.cl", " PAGOS@prov.cl ", "gerencia@prov.cl"] });
      expect(res.status).toBe(201);
      providerIds.push(res.body.data.id);
      expect(res.body.data.additionalEmails).toEqual(["pagos@prov.cl", "gerencia@prov.cl"]);

      const detail = await request(app).get(`/api/providers/${res.body.data.id}`).set(auth());
      expect(detail.body.data.additionalEmails).toEqual(["pagos@prov.cl", "gerencia@prov.cl"]);
      const list = await request(app).get("/api/providers").query({ search: tag }).set(auth());
      expect(list.body.data.find((p: { id: string }) => p.id === res.body.data.id).additionalEmails).toEqual(["pagos@prov.cl", "gerencia@prov.cl"]);
    });

    it("rechaza correos inválidos; al editar otros campos no se pierden; se reemplazan al enviarlos", async () => {
      expect((await create({ additionalEmails: ["malo"] })).status).toBe(400);

      const res = await create({ additionalEmails: ["a@prov.cl"] });
      const id = res.body.data.id;
      providerIds.push(id);
      const rename = await request(app).patch(`/api/providers/${id}`).set(auth()).send({ name: `Hotel nuevo ${tag}` });
      expect(rename.body.data.additionalEmails).toEqual(["a@prov.cl"]);
      const replace = await request(app).patch(`/api/providers/${id}`).set(auth()).send({ additionalEmails: ["b@prov.cl", "c@prov.cl"] });
      expect(replace.body.data.additionalEmails).toEqual(["b@prov.cl", "c@prov.cl"]);
      expect((await request(app).patch(`/api/providers/${id}`).set(auth()).send({ additionalEmails: ["x"] })).status).toBe(400);
      expect((await prisma.provider.findUnique({ where: { id } })).additionalEmails).toEqual(["b@prov.cl", "c@prov.cl"]);
    });
  });
});
