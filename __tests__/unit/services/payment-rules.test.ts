const mockPrisma = {
  quotation: { findFirst: jest.fn(), findMany: jest.fn() },
  payment: { count: jest.fn() },
};
jest.mock("../../../src/lib/prisma", () => ({ prisma: mockPrisma }));

import { resolveFullPaymentQuotation } from "../../../src/services/payment-rules";

const accepted = (over: object = {}) => ({ id: "q1", total: 119000, currency: "CLP", status: "ACEPTADA", ...over });
const base = { requestId: "req-1", amount: 119000, currency: "CLP" };

describe("resolveFullPaymentQuotation (sin pagos parciales)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.payment.count.mockResolvedValue(0);
  });

  it("sin cotización indicada usa la única aceptada de la solicitud", async () => {
    mockPrisma.quotation.findMany.mockResolvedValue([accepted()]);
    await expect(resolveFullPaymentQuotation(base)).resolves.toBe("q1");
  });

  it("sin cotizaciones aceptadas no hay nada que cobrar (409)", async () => {
    mockPrisma.quotation.findMany.mockResolvedValue([]);
    await expect(resolveFullPaymentQuotation(base)).rejects.toMatchObject({ statusCode: 409, code: "NO_ACCEPTED_QUOTATION" });
  });

  it("con varias aceptadas exige indicar cuál (400)", async () => {
    mockPrisma.quotation.findMany.mockResolvedValue([accepted(), accepted({ id: "q2" })]);
    await expect(resolveFullPaymentQuotation(base)).rejects.toMatchObject({ statusCode: 400, code: "QUOTATION_REQUIRED" });
  });

  it("rechaza un monto menor al total (pago parcial)", async () => {
    mockPrisma.quotation.findMany.mockResolvedValue([accepted()]);
    await expect(resolveFullPaymentQuotation({ ...base, amount: 50000 })).rejects.toMatchObject({
      statusCode: 400, code: "PARTIAL_PAYMENT_NOT_ALLOWED",
    });
  });

  it("rechaza también un monto mayor al total", async () => {
    mockPrisma.quotation.findMany.mockResolvedValue([accepted()]);
    await expect(resolveFullPaymentQuotation({ ...base, amount: 200000 })).rejects.toMatchObject({ code: "PARTIAL_PAYMENT_NOT_ALLOWED" });
  });

  it("con cotización indicada: debe estar aceptada y pertenecer a la solicitud", async () => {
    mockPrisma.quotation.findFirst.mockResolvedValueOnce(null);
    await expect(resolveFullPaymentQuotation({ ...base, quotationId: "otra" })).rejects.toMatchObject({ statusCode: 400 });

    mockPrisma.quotation.findFirst.mockResolvedValueOnce(accepted({ status: "ENVIADA" }));
    await expect(resolveFullPaymentQuotation({ ...base, quotationId: "q1" })).rejects.toMatchObject({ code: "QUOTATION_NOT_ACCEPTED" });
  });

  it("rechaza una moneda distinta a la de la cotización", async () => {
    mockPrisma.quotation.findFirst.mockResolvedValue(accepted());
    await expect(resolveFullPaymentQuotation({ ...base, quotationId: "q1", currency: "USD" })).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
  });

  it("rechaza un segundo pago para la misma cotización", async () => {
    mockPrisma.quotation.findMany.mockResolvedValue([accepted()]);
    mockPrisma.payment.count.mockResolvedValue(1);
    await expect(resolveFullPaymentQuotation(base)).rejects.toMatchObject({ statusCode: 409, code: "PAYMENT_ALREADY_EXISTS" });
  });

  it("al editar, el propio pago no cuenta como duplicado", async () => {
    mockPrisma.quotation.findMany.mockResolvedValue([accepted()]);
    await resolveFullPaymentQuotation({ ...base, excludePaymentId: "p1" });
    expect(mockPrisma.payment.count).toHaveBeenCalledWith({
      where: { quotationId: "q1", status: { in: ["PENDIENTE", "COMPLETADO"] }, id: { not: "p1" } },
    });
  });

  it("compara montos USD a nivel de centavos", async () => {
    mockPrisma.quotation.findMany.mockResolvedValue([accepted({ total: 83.86, currency: "USD" })]);
    await expect(resolveFullPaymentQuotation({ requestId: "req-1", amount: 83.86, currency: "USD" })).resolves.toBe("q1");
    await expect(resolveFullPaymentQuotation({ requestId: "req-1", amount: 83.85, currency: "USD" })).rejects.toMatchObject({ code: "PARTIAL_PAYMENT_NOT_ALLOWED" });
  });
});
