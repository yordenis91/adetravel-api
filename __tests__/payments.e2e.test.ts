import { prisma } from "../src/lib/prisma";
import { changePaymentStatus } from "../src/controllers/payments.controller";
import { Request, Response } from "express";

describe("Payment completion notification (integration)", () => {
  let admin: any;
  let client: any;
  let requestRec: any;
  let payment: any;

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { email: `test-admin+${Date.now()}@example.com`, fullName: "Test Admin", passwordHash: "x", role: "ADMINISTRADOR" } });
    client = await prisma.client.create({ data: { firstName: "Test", lastName: "Client" } });
    requestRec = await prisma.request.create({ data: { requestNumber: `REQ-${Date.now()}`, clientId: client.id, createdBy: admin.id } });
    payment = await prisma.payment.create({
      data: {
        paymentNumber: `PAG-${Date.now()}`,
        requestId: requestRec.id,
        clientId: client.id,
        amount: 123.45,
        currency: "CLP",
        method: "TRANSFERENCIA",
        status: "PENDIENTE",
        createdBy: admin.id
      }
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { relatedEntityId: payment.id } });
    await prisma.payment.delete({ where: { id: payment.id } });
    await prisma.request.delete({ where: { id: requestRec.id } });
    await prisma.client.delete({ where: { id: client.id } });
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  it("creates a notification when payment changes to COMPLETADO", async () => {
    const req: Partial<Request> = {
      params: { id: payment.id } as any,
      body: { status: "COMPLETADO" } as any,
      user: { id: admin.id } as any
    };

    const res: Partial<Response> = {
      status: () => res as Response,
      json: () => res as Response
    } as any;

    await changePaymentStatus(req as Request, res as Response);

    const notif = await prisma.notification.findFirst({ where: { relatedEntityId: payment.id } });
    expect(notif).not.toBeNull();
    expect(notif?.title).toMatch(/Pago Recibido/i);
  });
});
