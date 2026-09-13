import { Request, Response } from "express";
import { createPrismaMock, createMockRes } from "../helpers/prisma-mock";

const mockPrisma = createPrismaMock();
const mockCreateActivityLog = jest.fn().mockResolvedValue(undefined);
const mockSendTemplateEmail = jest.fn().mockResolvedValue(undefined);
const mockGenerateNumber = jest.fn().mockResolvedValue("PAG-2026-01-0001");
const mockAdvanceWorkflowStatus = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../src/lib/prisma", () => ({ prisma: mockPrisma }));
jest.mock("../../../src/services/activity-log.service", () => ({
  createActivityLog: mockCreateActivityLog,
}));
jest.mock("../../../src/services/email.service", () => ({
  sendTemplateEmail: mockSendTemplateEmail,
}));
jest.mock("../../../src/services/numbering.service", () => ({
  generateNumber: mockGenerateNumber,
}));
jest.mock("../../../src/services/workflow.service", () => ({
  advanceWorkflowStatus: mockAdvanceWorkflowStatus,
}));

import {
  listPayments,
  getPaymentStats,
  getPayment,
  createPayment,
  updatePayment,
  changePaymentStatus,
  deletePayment,
} from "../../../src/controllers/payments.controller";

const AUTH_USER = { id: "user-1", email: "admin@example.com", fullName: "Admin", role: "ADMINISTRADOR", agencyRole: null, isActive: true } as any;

function buildReq(overrides: Partial<Request> = {}): Request {
  return { query: {}, params: {}, body: {}, user: AUTH_USER, ...overrides } as unknown as Request;
}

describe("payments.controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listPayments", () => {
    it("filtra por status (normalizando a mayúsculas) y por clientId/requestId", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);
      const req = buildReq({
        query: { status: "pendiente", clientId: "c1", requestId: "r1" } as any,
      });

      await listPayments(req, createMockRes());

      const args = mockPrisma.payment.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ status: "PENDIENTE", clientId: "c1", requestId: "r1" });
    });

    it("arma un OR de búsqueda por texto (paymentNumber, referencia, nombre/apellido del cliente)", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);
      const req = buildReq({ query: { search: "Ana" } as any });

      await listPayments(req, createMockRes());

      const args = mockPrisma.payment.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ paymentNumber: expect.anything() }),
          expect.objectContaining({ client: { firstName: expect.anything() } }),
        ])
      );
    });

    it("devuelve la lista paginada usando sendList", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([{ id: "p1" }]);
      mockPrisma.payment.count.mockResolvedValue(1);
      const res = createMockRes();

      await listPayments(buildReq(), res);

      expect(res.json).toHaveBeenCalledWith({ data: [{ id: "p1" }], total: 1, page: 1, limit: 20 });
    });
  });

  describe("getPaymentStats", () => {
    it("suma correctamente los montos COMPLETADO separados por moneda", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        { currency: "CLP", amount: 1000 },
        { currency: "CLP", amount: 2000 },
        { currency: "USD", amount: 50 },
      ]);
      mockPrisma.payment.count
        .mockResolvedValueOnce(3) // pendientes
        .mockResolvedValueOnce(5) // completados
        .mockResolvedValueOnce(1); // cancelados

      const res = createMockRes();
      await getPaymentStats(buildReq(), res);

      expect(res.json).toHaveBeenCalledWith({
        data: { totalCLP: 3000, totalUSD: 50, pendientes: 3, completados: 5, cancelados: 1 },
      });
    });

    it("no cuenta pagos que no estén COMPLETADO en las sumas por moneda", async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.payment.count.mockResolvedValue(0);

      const res = createMockRes();
      await getPaymentStats(buildReq(), res);

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith({
        where: { status: "COMPLETADO" },
      });
    });
  });

  describe("getPayment", () => {
    it("lanza ApiError 404 cuando el pago no existe", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);
      const res = createMockRes();

      await expect(getPayment(buildReq({ params: { id: "no-existe" } } as any), res)).rejects.toMatchObject({
        statusCode: 404,
        code: "PAYMENT_NOT_FOUND",
      });
    });

    it("devuelve el pago cuando existe", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({ id: "p1", amount: 100 });
      const res = createMockRes();

      await getPayment(buildReq({ params: { id: "p1" } } as any), res);

      expect(res.json).toHaveBeenCalledWith({ data: { id: "p1", amount: 100 } });
    });
  });

  describe("createPayment", () => {
    it("lanza 404 si la solicitud (requestId) no existe", async () => {
      mockPrisma.request.findUnique.mockResolvedValue(null);
      const res = createMockRes();
      const req = buildReq({ body: { requestId: "no-existe", amount: 100 } } as any);

      await expect(createPayment(req, res)).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it("lanza 400 si la cotización no pertenece a la solicitud indicada", async () => {
      mockPrisma.request.findUnique.mockResolvedValue({ id: "req-1", clientId: "client-1" });
      mockPrisma.quotation.findFirst.mockResolvedValue(null);
      const res = createMockRes();
      const req = buildReq({
        body: { requestId: "req-1", quotationId: "quo-otra-solicitud", amount: 100 },
      } as any);

      await expect(createPayment(req, res)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("asigna clientId automáticamente desde la solicitud, ignorando cualquier clientId del body", async () => {
      mockPrisma.request.findUnique.mockResolvedValue({ id: "req-1", clientId: "client-real" });
      mockPrisma.systemConfig.findFirst.mockResolvedValue(null);
      mockPrisma.payment.create.mockResolvedValue({ id: "p1", paymentNumber: "PAG-2026-01-0001", client: {} });
      const res = createMockRes();
      const req = buildReq({
        body: { requestId: "req-1", amount: 100, clientId: "client-suplantado" },
      } as any);

      await createPayment(req, res);

      expect(mockPrisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clientId: "client-real", status: "PENDIENTE" }),
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockCreateActivityLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "CREATE", entityType: "Payment" })
      );
    });
  });

  describe("updatePayment", () => {
    it("lanza 404 si el pago no existe", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);
      const res = createMockRes();

      await expect(updatePayment(buildReq({ params: { id: "x" } } as any), res)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("rechaza editar un pago que ya no está PENDIENTE", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({ id: "p1", status: "COMPLETADO" });
      const res = createMockRes();

      await expect(updatePayment(buildReq({ params: { id: "p1" } } as any), res)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    });

    it("elimina 'status' del payload para que no se pueda forzar por esta vía", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({ id: "p1", status: "PENDIENTE" });
      mockPrisma.payment.update.mockResolvedValue({ id: "p1", paymentNumber: "PAG-1", client: {} });
      const res = createMockRes();
      const req = buildReq({
        params: { id: "p1" },
        body: { amount: 200, status: "COMPLETADO" },
      } as any);

      await updatePayment(req, res);

      const updateArgs = mockPrisma.payment.update.mock.calls[0][0];
      expect(updateArgs.data).not.toHaveProperty("status");
      expect(updateArgs.data).toEqual({ amount: 200 });
    });
  });

  describe("changePaymentStatus", () => {
    it("rechaza una transición no permitida (p.ej. CANCELADO -> COMPLETADO directo)", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({ id: "p1", status: "CANCELADO", client: {} });
      const res = createMockRes();
      const req = buildReq({ params: { id: "p1" }, body: { status: "COMPLETADO" } } as any);

      await expect(changePaymentStatus(req, res)).rejects.toMatchObject({ statusCode: 409 });
      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
    });

    it("al completar un pago: actualiza estado, envía email y crea notificación", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "p1",
        status: "PENDIENTE",
        requestId: "req-1",
        paymentNumber: "PAG-1",
        client: { email: "cliente@example.com" },
      });
      mockPrisma.payment.update.mockResolvedValue({
        id: "p1",
        paymentNumber: "PAG-1",
        amount: 500,
        currency: "CLP",
        client: { email: "cliente@example.com", firstName: "Ana" },
        request: { createdBy: "vendedor-1" },
      });
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ notifyOnPaymentCompleted: true });
      const res = createMockRes();
      const req = buildReq({ params: { id: "p1" }, body: { status: "COMPLETADO" } } as any);

      await changePaymentStatus(req, res);

      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "COMPLETADO" } })
      );
      expect(mockSendTemplateEmail).toHaveBeenCalledWith(
        expect.objectContaining({ type: "PAYMENT_CONFIRMED", to: "cliente@example.com" })
      );
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: "vendedor-1", type: "PAYMENT_COMPLETED" }),
        })
      );
      expect(mockAdvanceWorkflowStatus).toHaveBeenCalledWith("req-1", null, "PAGADO_POR_CLIENTE");
    });

    it("no envía email de confirmación si el switch notifyOnPaymentCompleted está apagado", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "p1",
        status: "PENDIENTE",
        requestId: "req-1",
        paymentNumber: "PAG-1",
        client: { email: "cliente@example.com" },
      });
      mockPrisma.payment.update.mockResolvedValue({
        id: "p1",
        paymentNumber: "PAG-1",
        amount: 500,
        currency: "CLP",
        client: { email: "cliente@example.com" },
        request: { createdBy: "vendedor-1" },
      });
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ notifyOnPaymentCompleted: false });
      const res = createMockRes();
      const req = buildReq({ params: { id: "p1" }, body: { status: "COMPLETADO" } } as any);

      await changePaymentStatus(req, res);

      expect(mockSendTemplateEmail).not.toHaveBeenCalled();
    });

    it("no crea una segunda notificación si el pago ya estaba COMPLETADO", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: "p1",
        status: "COMPLETADO",
        requestId: "req-1",
        paymentNumber: "PAG-1",
        client: { email: "cliente@example.com" },
      });
      mockPrisma.payment.update.mockResolvedValue({
        id: "p1",
        paymentNumber: "PAG-1",
        amount: 500,
        currency: "CLP",
        client: { email: "cliente@example.com" },
        request: { createdBy: "vendedor-1" },
      });
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ notifyOnPaymentCompleted: true });
      const res = createMockRes();
      // COMPLETADO -> CANCELADO está permitido (reversa); no debe re-notificar como "completado".
      const req = buildReq({ params: { id: "p1" }, body: { status: "CANCELADO" } } as any);

      await changePaymentStatus(req, res);

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe("deletePayment", () => {
    it("lanza 404 si el pago no existe", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);
      const res = createMockRes();

      await expect(deletePayment(buildReq({ params: { id: "x" } } as any), res)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("rechaza eliminar un pago ya COMPLETADO", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({ id: "p1", status: "COMPLETADO" });
      const res = createMockRes();

      await expect(deletePayment(buildReq({ params: { id: "p1" } } as any), res)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(mockPrisma.payment.delete).not.toHaveBeenCalled();
    });

    it("elimina un pago PENDIENTE o CANCELADO correctamente", async () => {
      mockPrisma.payment.findUnique.mockResolvedValue({ id: "p1", status: "PENDIENTE", paymentNumber: "PAG-1" });
      mockPrisma.payment.delete.mockResolvedValue({ id: "p1", paymentNumber: "PAG-1" });
      const res = createMockRes();

      await deletePayment(buildReq({ params: { id: "p1" } } as any), res);

      expect(mockPrisma.payment.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ok: true }) })
      );
    });
  });
});
