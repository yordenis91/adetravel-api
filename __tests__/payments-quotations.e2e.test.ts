// Pagos y cotizaciones de extremo a extremo contra Postgres (npm run test:e2e): casos P0 de
// docs/pruebas-pagos-cotizaciones.md (ia-team-adetravel). Correo y PDF simulados: nunca sale nada.
process.env.RATE_LIMIT_MAX = "100000";

jest.mock("../src/services/pdf.service", () => ({
  generateQuotationPdfBuffer: jest.fn().mockResolvedValue(Buffer.from("%PDF-simulado")),
  generateVoucherPdfBuffer: jest.fn().mockResolvedValue(Buffer.from("%PDF-simulado")),
  buildQuotationHtml: jest.fn().mockReturnValue("<html></html>"),
}));
jest.mock("../src/services/email.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendTemplateEmail: jest.fn().mockResolvedValue(undefined),
}));

import jwt from "jsonwebtoken";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require("../src/config/env");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../src/lib/prisma");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const email = require("../src/services/email.service");

const tag = `pq-${Date.now()}`;
let seq = 0;

describe("pagos y cotizaciones de extremo a extremo (integración con Postgres)", () => {
  let admin: any;
  let client: any;
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { email: `${tag}-a@example.com`, fullName: "A", passwordHash: "x", role: "ADMINISTRADOR" } });
    client = await prisma.client.create({ data: { firstName: "Pago", lastName: "Prueba", email: `${tag}@cliente.cl` } });
  });

  afterAll(async () => {
    const where = { requestId: { in: requestIds } };
    await prisma.payment.deleteMany({ where });
    await prisma.service.deleteMany({ where });
    await prisma.quotation.deleteMany({ where });
    await prisma.notification.deleteMany({ where: { userId: admin.id } });
    await prisma.activityLog.deleteMany({ where: { performedBy: admin.id } });
    await prisma.request.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.client.deleteMany({ where: { id: client?.id } });
    await prisma.user.deleteMany({ where: { id: admin?.id } });
    await prisma.$disconnect();
  });

  beforeEach(() => (email.sendTemplateEmail as jest.Mock).mockClear());

  const auth = () => `Bearer ${jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, env.JWT_SECRET)}`;
  const post = (path: string, body: object) => request(app).post(path).set("Authorization", auth()).send(body);
  const patch = (path: string, body: object) => request(app).patch(path).set("Authorization", auth()).send(body);
  const codeOf = (res: any) => res.body.error?.code ?? res.body.code;
  const statusOf = async (id: string) => (await prisma.request.findUnique({ where: { id }, select: { status: true } })).status;

  async function newRequest(status = "RECEPCIONADA") {
    seq += 1;
    const r = await prisma.request.create({
      data: { requestNumber: `${tag}-R${seq}`, clientId: client.id, isPackage: true, status, createdBy: admin.id },
    });
    requestIds.push(r.id);
    return r;
  }

  async function acceptedQuotation(currency = "CLP", items = [{ service: "Hotel", description: "", quantity: 2, unitPrice: 50000, total: 0 }]) {
    const req = await newRequest();
    const q = await post("/api/quotations", { requestId: req.id, clientId: client.id, currency, taxPercentage: 19, discount: 0, items, validUntil: "2099-12-31" });
    expect(q.status).toBe(201);
    expect((await patch(`/api/quotations/${q.body.data.id}/status`, { status: "ENVIADA" })).status).toBe(200);
    expect((await patch(`/api/quotations/${q.body.data.id}/status`, { status: "ACEPTADA" })).status).toBe(200);
    return { req, quotation: (await prisma.quotation.findUnique({ where: { id: q.body.data.id } })) };
  }

  it("ciclo completo: cotizar, enviar, aceptar, cobrar el total y completar", async () => {
    const req = await newRequest();
    const q = await post("/api/quotations", {
      requestId: req.id, clientId: client.id, currency: "CLP", taxPercentage: 19, discount: 10000,
      items: [{ service: "Hotel", description: "3 noches", quantity: 3, unitPrice: 45000, total: 0 }],
      validUntil: "2099-12-31",
    });
    expect(q.status).toBe(201);
    // 135.000 - 10.000 = 125.000; IVA 19 % = 23.750; total 148.750
    expect({ subtotal: q.body.data.subtotal, taxAmount: q.body.data.taxAmount, total: q.body.data.total }).toEqual({ subtotal: 135000, taxAmount: 23750, total: 148750 });
    expect(await statusOf(req.id)).toBe("COTIZADO_POR_ADETRAVEL");

    expect((await patch(`/api/quotations/${q.body.data.id}/status`, { status: "ENVIADA" })).status).toBe(200);
    expect(await statusOf(req.id)).toBe("ENVIADO_AL_CLIENTE");
    const enviado = (email.sendTemplateEmail as jest.Mock).mock.calls.find(([o]) => o.type === "QUOTATION_SENT")?.[0];
    expect(enviado).toMatchObject({ to: `${tag}@cliente.cl` });
    expect(enviado.fallbackHtml).toContain("148.750");
    expect(enviado.attachments?.[0]?.filename).toBe(`${q.body.data.quotationNumber}.pdf`);

    expect((await patch(`/api/quotations/${q.body.data.id}/status`, { status: "ACEPTADA" })).status).toBe(200);
    expect(await statusOf(req.id)).toBe("ACEPTADA_POR_CLIENTE");

    const parcial = await post("/api/payments", { requestId: req.id, amount: 100000, currency: "CLP", method: "TRANSFERENCIA" });
    expect([parcial.status, codeOf(parcial)]).toEqual([400, "PARTIAL_PAYMENT_NOT_ALLOWED"]);

    const pago = await post("/api/payments", { requestId: req.id, amount: 148750, currency: "CLP", method: "TRANSFERENCIA" });
    expect(pago.status).toBe(201);
    expect(pago.body.data).toMatchObject({ status: "PENDIENTE", quotationId: q.body.data.id, clientId: client.id });

    expect((await patch(`/api/payments/${pago.body.data.id}/status`, { status: "COMPLETADO" })).status).toBe(200);
    expect(await statusOf(req.id)).toBe("PAGADO_POR_CLIENTE");
    expect(await prisma.notification.count({ where: { relatedEntityId: pago.body.data.id } })).toBe(1);
    expect((email.sendTemplateEmail as jest.Mock).mock.calls.filter(([o]) => o.type === "PAYMENT_CONFIRMED")).toHaveLength(1);
  });

  it("un solo pago vivo por cotización, también al reabrir uno cancelado", async () => {
    const { req, quotation } = await acceptedQuotation();
    const total = quotation.total;
    const a = await post("/api/payments", { requestId: req.id, amount: total, method: "EFECTIVO" });
    expect(a.status).toBe(201);
    const duplicado = await post("/api/payments", { requestId: req.id, amount: total, method: "EFECTIVO" });
    expect([duplicado.status, codeOf(duplicado)]).toEqual([409, "PAYMENT_ALREADY_EXISTS"]);

    expect((await patch(`/api/payments/${a.body.data.id}/status`, { status: "CANCELADO" })).status).toBe(200);
    const b = await post("/api/payments", { requestId: req.id, amount: total, method: "EFECTIVO" });
    expect(b.status).toBe(201);

    const reabrir = await patch(`/api/payments/${a.body.data.id}/status`, { status: "PENDIENTE" });
    expect([reabrir.status, codeOf(reabrir)]).toEqual([409, "PAYMENT_ALREADY_EXISTS"]);
    expect(await prisma.payment.count({ where: { requestId: req.id, status: { in: ["PENDIENTE", "COMPLETADO"] } } })).toBe(1);

    // Sin otro pago vivo, reabrir sí se permite.
    expect((await patch(`/api/payments/${b.body.data.id}/status`, { status: "CANCELADO" })).status).toBe(200);
    expect((await patch(`/api/payments/${a.body.data.id}/status`, { status: "PENDIENTE" })).status).toBe(200);
  });

  it("monto exacto en USD, al centavo", async () => {
    const { req, quotation } = await acceptedQuotation("USD", [
      { service: "Tour", description: "", quantity: 1, unitPrice: 10.5, total: 0 },
      { service: "Traslado", description: "", quantity: 3, unitPrice: 0.333, total: 0 },
    ]);
    // 10,50 + 1,00 (3 × 0,333 = 0,999 → 1,00) = 11,50; IVA 19 % = 2,19 (2,185 → 2,19); total 13,69
    expect(quotation.total).toBe(13.69);
    for (const amount of [13.68, 13.7]) {
      const res = await post("/api/payments", { requestId: req.id, amount, currency: "USD", method: "TARJETA" });
      expect({ amount, status: res.status, code: codeOf(res) }).toEqual({ amount, status: 400, code: "PARTIAL_PAYMENT_NOT_ALLOWED" });
    }
    const otraMoneda = await post("/api/payments", { requestId: req.id, amount: 13.69, currency: "CLP", quotationId: quotation.id, method: "TARJETA" });
    expect([otraMoneda.status, codeOf(otraMoneda)]).toEqual([400, "CURRENCY_MISMATCH"]);
    expect((await post("/api/payments", { requestId: req.id, amount: 13.69, currency: "USD", method: "TARJETA" })).status).toBe(201);
  });

  it("una solicitud cancelada no permite enviar ni aceptar cotizaciones, ni cobrar", async () => {
    const req = await newRequest();
    const q = await post("/api/quotations", {
      requestId: req.id, clientId: client.id, currency: "CLP", items: [{ service: "Visa", description: "", quantity: 1, unitPrice: 30000, total: 0 }],
      validUntil: "2099-12-31",
    });
    expect((await patch(`/api/quotations/${q.body.data.id}/status`, { status: "ENVIADA" })).status).toBe(200);
    await prisma.request.update({ where: { id: req.id }, data: { status: "CANCELADA" } });

    const aceptar = await patch(`/api/quotations/${q.body.data.id}/status`, { status: "ACEPTADA" });
    expect([aceptar.status, codeOf(aceptar)]).toEqual([409, "REQUEST_CANCELLED"]);
    expect((await prisma.quotation.findUnique({ where: { id: q.body.data.id } })).status).toBe("ENVIADA");
    expect((await patch(`/api/quotations/${q.body.data.id}/status`, { status: "RECHAZADA" })).status).toBe(200);

    const pago = await post("/api/payments", { requestId: req.id, amount: 30000, method: "EFECTIVO" });
    expect([pago.status, codeOf(pago)]).toEqual([409, "REQUEST_CANCELLED"]);
  });

  describe("decisiones del administrador (2026-10-08)", () => {
    it("se puede cobrar antes de la confirmación del proveedor: aceptada pasa a pagada", async () => {
      const { req, quotation } = await acceptedQuotation();
      expect(await statusOf(req.id)).toBe("ACEPTADA_POR_CLIENTE");
      const pago = await post("/api/payments", { requestId: req.id, amount: quotation.total, method: "EFECTIVO" });
      expect((await patch(`/api/payments/${pago.body.data.id}/status`, { status: "COMPLETADO" })).status).toBe(200);
      expect(await statusOf(req.id)).toBe("PAGADO_POR_CLIENTE");
    });

    it("revertir el pago cobrado devuelve la solicitud y sus servicios a 'solicitud de pago enviada'", async () => {
      const { req, quotation } = await acceptedQuotation();
      const svc = await prisma.service.create({ data: { serviceNumber: `${tag}-S${seq}`, requestId: req.id, type: "SEGURO", details: {} } });
      const pago = await post("/api/payments", { requestId: req.id, amount: quotation.total, method: "EFECTIVO" });
      await patch(`/api/payments/${pago.body.data.id}/status`, { status: "COMPLETADO" });
      expect(await statusOf(req.id)).toBe("PAGADO_POR_CLIENTE");
      expect((await prisma.service.findUnique({ where: { id: svc.id } })).status).toBe("PAGADO_POR_CLIENTE");

      expect((await patch(`/api/payments/${pago.body.data.id}/status`, { status: "CANCELADO" })).status).toBe(200);
      expect(await statusOf(req.id)).toBe("ENVIADA_SOLICITUD_PAGO_CLIENTE");
      expect((await prisma.service.findUnique({ where: { id: svc.id } })).status).toBe("ENVIADA_SOLICITUD_PAGO_CLIENTE");
      await prisma.service.delete({ where: { id: svc.id } });
    });

    it("si la solicitud ya avanzó más allá del pago, la reversa no la toca", async () => {
      const { req, quotation } = await acceptedQuotation();
      const pago = await post("/api/payments", { requestId: req.id, amount: quotation.total, method: "EFECTIVO" });
      await patch(`/api/payments/${pago.body.data.id}/status`, { status: "COMPLETADO" });
      await prisma.request.update({ where: { id: req.id }, data: { status: "PAGADO_AL_PROVEEDOR" } });
      expect((await patch(`/api/payments/${pago.body.data.id}/status`, { status: "CANCELADO" })).status).toBe(200);
      expect(await statusOf(req.id)).toBe("PAGADO_AL_PROVEEDOR");
    });
  });

  it("10 altas simultáneas del mismo pago crean exactamente uno", async () => {
    const { req, quotation } = await acceptedQuotation();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => post("/api/payments", { requestId: req.id, amount: quotation.total, method: "EFECTIVO" }))
    );
    const created = results.filter((r) => r.status === 201).length;
    const vivos = await prisma.payment.count({ where: { requestId: req.id, status: { in: ["PENDIENTE", "COMPLETADO"] } } });
    expect({ created, vivos }).toEqual({ created: 1, vivos: 1 });
  });
});
