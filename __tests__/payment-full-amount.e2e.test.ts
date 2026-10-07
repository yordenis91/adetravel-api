// Flujo de cobro con Postgres real y la decisión asumida "sin pagos parciales"
// (ALLOW_PARTIAL_PAYMENTS=false por defecto; ver DECISIONES_PENDIENTES.md).
jest.mock("../src/services/pdf.service", () => ({}));
jest.mock("../src/services/email.service", () => ({ sendTemplateEmail: jest.fn().mockResolvedValue(undefined), sendEmail: jest.fn() }));

import { Request, Response } from "express";

const tag = Date.now();

function fakeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response & { json: jest.Mock; status: jest.Mock };
}

describe("cobro sin pagos parciales (integración con Postgres)", () => {
  let prisma: any;
  let ctrl: typeof import("../src/controllers/payments.controller");
  let admin: any, client: any, request: any, quotation: any;
  const user = () => ({ id: admin.id, role: "ADMINISTRADOR" });
  const create = (body: object) =>
    ctrl.createPayment({ body: { requestId: request.id, method: "TRANSFERENCIA", currency: "CLP", ...body }, user: user() } as unknown as Request, fakeRes());

  beforeAll(async () => {
    ({ prisma } = require("../src/lib/prisma"));
    ctrl = require("../src/controllers/payments.controller");
    admin = await prisma.user.create({ data: { email: `full-${tag}@example.com`, fullName: "Full Admin", passwordHash: "x", role: "ADMINISTRADOR" } });
    client = await prisma.client.create({ data: { firstName: "Full", lastName: "Pay" } });
    request = await prisma.request.create({ data: { requestNumber: `REQ-FULL-${tag}`, clientId: client.id, createdBy: admin.id } });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: admin.id } });
    await prisma.payment.deleteMany({ where: { requestId: request.id } });
    await prisma.quotation.deleteMany({ where: { requestId: request.id } });
    await prisma.request.delete({ where: { id: request.id } });
    await prisma.client.delete({ where: { id: client.id } });
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  it("sin cotización aceptada no hay nada que cobrar", async () => {
    await expect(create({ amount: 119000 })).rejects.toMatchObject({ code: "NO_ACCEPTED_QUOTATION" });
  });

  it("rechaza un pago parcial, acepta el total, y completar el pago avanza la solicitud", async () => {
    quotation = await prisma.quotation.create({
      data: {
        quotationNumber: `COT-FULL-${tag}`, requestId: request.id, clientId: client.id, status: "ACEPTADA",
        currency: "CLP", items: [], subtotal: 100000, taxPercentage: 19, taxAmount: 19000, total: 119000, validUntil: "2999-01-01",
      },
    });

    await expect(create({ amount: 50000 })).rejects.toMatchObject({ code: "PARTIAL_PAYMENT_NOT_ALLOWED" });

    const res = fakeRes();
    await ctrl.createPayment(
      { body: { requestId: request.id, method: "TRANSFERENCIA", currency: "CLP", amount: 119000 }, user: user() } as unknown as Request,
      res
    );
    const payment = res.json.mock.calls[0][0].data;
    expect(payment).toMatchObject({ quotationId: quotation.id, amount: 119000, status: "PENDIENTE" });

    // Un segundo pago para la misma cotización no se acepta.
    await expect(create({ amount: 119000 })).rejects.toMatchObject({ code: "PAYMENT_ALREADY_EXISTS" });

    await prisma.request.update({ where: { id: request.id }, data: { status: "ENVIADA_SOLICITUD_PAGO_CLIENTE" } });
    await ctrl.changePaymentStatus(
      { params: { id: payment.id }, body: { status: "COMPLETADO" }, user: user() } as unknown as Request,
      fakeRes()
    );

    const after = await prisma.request.findUnique({ where: { id: request.id } });
    expect(after.status).toBe("PAGADO_POR_CLIENTE");
  });
});
