import { Request, Response } from "express";
import { createMockRes } from "../helpers/prisma-mock";

const mockPrisma = {
  request: { findUnique: jest.fn() },
  service: { findFirst: jest.fn() },
  systemConfig: { findFirst: jest.fn() },
  quotation: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  payment: { count: jest.fn() },
};
const mockEnv: Record<string, unknown> = {};
const mockSendTemplateEmail = jest.fn().mockResolvedValue(undefined);
const mockGeneratePdf = jest.fn().mockResolvedValue(Buffer.from("%PDF-fake"));

jest.mock("../../../src/lib/prisma", () => ({ prisma: mockPrisma }));
jest.mock("../../../src/config/env", () => {
  Object.assign(mockEnv, jest.requireActual("../../../src/config/env").env);
  return { env: mockEnv };
});
jest.mock("../../../src/services/activity-log.service", () => ({ createActivityLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../src/services/email.service", () => ({ sendTemplateEmail: mockSendTemplateEmail }));
jest.mock("../../../src/services/numbering.service", () => ({ generateNumber: jest.fn().mockResolvedValue("COTIZ-2026-10-0001") }));
jest.mock("../../../src/services/workflow.service", () => ({ advanceWorkflowStatus: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../src/services/pdf.service", () => ({ generateQuotationPdfBuffer: mockGeneratePdf, buildQuotationHtml: jest.fn() }));
jest.mock("../../../src/services/agency.service", () => ({}));

import {
  createQuotation, updateQuotation, changeQuotationStatus, deleteQuotation,
} from "../../../src/controllers/quotations.controller";

const body = {
  requestId: "req-1",
  clientId: "cli-1",
  taxPercentage: 19,
  discount: 0,
  items: [{ service: "Hotel", description: "", quantity: 1, unitPrice: 1000, total: 1000 }],
};
const reqWith = (b: object) => ({ body: b, user: { id: "u1" } }) as unknown as Request;

describe("createQuotation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.systemConfig.findFirst.mockResolvedValue(null);
    mockPrisma.quotation.create.mockImplementation(async ({ data }) => ({ id: "q1", ...data }));
  });

  it("rechaza (400) un clientId distinto al cliente de la solicitud", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({ id: "req-1", clientId: "otro-cliente", status: "RECEPCIONADA" });

    await expect(createQuotation(reqWith(body), createMockRes() as unknown as Response)).rejects.toMatchObject({
      statusCode: 400,
      code: "CLIENT_REQUEST_MISMATCH",
    });
    expect(mockPrisma.quotation.create).not.toHaveBeenCalled();
  });

  it("crea la cotización cuando el cliente coincide con el de la solicitud", async () => {
    mockPrisma.request.findUnique.mockResolvedValue({ id: "req-1", clientId: "cli-1", status: "RECEPCIONADA" });
    const res = createMockRes();

    await createQuotation(reqWith(body), res as unknown as Response);

    expect(mockPrisma.quotation.create).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

const reqFor = (params: object, b: object = {}) => ({ params, body: b, user: { id: "u1" } }) as unknown as Request;
const future = "2999-01-01";
const past = "2000-01-01";
const draft = (over: object = {}) => ({
  id: "q1", quotationNumber: "COTIZ-2026-10-0001", status: "BORRADOR", requestId: "req-1", clientId: "cli-1", serviceId: null,
  currency: "CLP", taxPercentage: 19, discount: 0, validUntil: future, total: 119000, items: [], client: { email: "c@x.cl", firstName: "Ana" }, ...over,
});

describe("createQuotation (moneda)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calcula los totales con los decimales de la moneda de la cotización", async () => {
    mockPrisma.systemConfig.findFirst.mockResolvedValue(null);
    mockPrisma.request.findUnique.mockResolvedValue({ id: "req-1", clientId: "cli-1", status: "RECEPCIONADA" });
    mockPrisma.quotation.create.mockImplementation(async ({ data }) => ({ id: "q1", ...data }));
    const usd = { ...body, currency: "USD", taxPercentage: 0, items: [{ service: "Hotel", description: "", quantity: 1, unitPrice: 10.5, total: 0 }] };

    await createQuotation(reqWith(usd), createMockRes() as unknown as Response);

    expect(mockPrisma.quotation.create.mock.calls[0][0].data).toMatchObject({ subtotal: 10.5, total: 10.5 });
  });
});

describe("updateQuotation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.quotation.update.mockImplementation(async ({ data }) => ({ id: "q1", ...data }));
  });

  it("no permite cambiar la solicitud ni el cliente de una cotización", async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue(draft());
    await expect(updateQuotation(reqFor({ id: "q1" }, { requestId: "otra" }), createMockRes() as unknown as Response))
      .rejects.toMatchObject({ code: "QUOTATION_REQUEST_LOCKED" });
    await expect(updateQuotation(reqFor({ id: "q1" }, { clientId: "otro" }), createMockRes() as unknown as Response))
      .rejects.toMatchObject({ code: "QUOTATION_CLIENT_LOCKED" });
    expect(mockPrisma.quotation.update).not.toHaveBeenCalled();
  });

  it("editar solo las notas no toca los totales", async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue(draft());
    await updateQuotation(reqFor({ id: "q1" }, { notes: "hola" }), createMockRes() as unknown as Response);
    expect(mockPrisma.quotation.update.mock.calls[0][0].data).toEqual({ notes: "hola" });
  });

  it("cambiar la moneda recalcula con los decimales de la nueva moneda", async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue(
      draft({ taxPercentage: 0, items: [{ service: "S", description: "", quantity: 1, unitPrice: 10.5, total: 11 }] })
    );
    await updateQuotation(reqFor({ id: "q1" }, { currency: "USD" }), createMockRes() as unknown as Response);
    expect(mockPrisma.quotation.update.mock.calls[0][0].data).toMatchObject({ currency: "USD", subtotal: 10.5, total: 10.5 });
  });
});

describe("changeQuotationStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.BLOCK_EXPIRED_QUOTATIONS = true;
    mockPrisma.systemConfig.findFirst.mockResolvedValue({ notifyOnQuotationSent: true });
    mockPrisma.quotation.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.quotation.findUniqueOrThrow.mockImplementation(async () => draft({ status: "ENVIADA" }));
  });

  it("no permite enviar una cotización vencida", async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue(draft({ validUntil: past }));
    await expect(changeQuotationStatus(reqFor({ id: "q1" }, { status: "ENVIADA" }), createMockRes() as unknown as Response))
      .rejects.toMatchObject({ statusCode: 409, code: "QUOTATION_EXPIRED" });
    expect(mockPrisma.quotation.updateMany).not.toHaveBeenCalled();
  });

  it("no permite aceptar una cotización vencida", async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue(draft({ status: "ENVIADA", validUntil: past }));
    await expect(changeQuotationStatus(reqFor({ id: "q1" }, { status: "ACEPTADA" }), createMockRes() as unknown as Response))
      .rejects.toMatchObject({ code: "QUOTATION_EXPIRED" });
  });

  it("con BLOCK_EXPIRED_QUOTATIONS=false una cotización vencida sí se puede enviar", async () => {
    mockEnv.BLOCK_EXPIRED_QUOTATIONS = false;
    mockPrisma.quotation.findUnique.mockResolvedValue(draft({ validUntil: past }));
    await changeQuotationStatus(reqFor({ id: "q1" }, { status: "ENVIADA" }), createMockRes() as unknown as Response);
    expect(mockPrisma.quotation.updateMany).toHaveBeenCalled();
  });

  it("rechazar sí se permite aunque esté vencida", async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue(draft({ status: "ENVIADA", validUntil: past }));
    await changeQuotationStatus(reqFor({ id: "q1" }, { status: "RECHAZADA" }), createMockRes() as unknown as Response);
    expect(mockPrisma.quotation.updateMany).toHaveBeenCalled();
  });

  it("responde 409 STATUS_CONFLICT si otra petición ya cambió el estado", async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue(draft());
    mockPrisma.quotation.updateMany.mockResolvedValue({ count: 0 });
    await expect(changeQuotationStatus(reqFor({ id: "q1" }, { status: "ENVIADA" }), createMockRes() as unknown as Response))
      .rejects.toMatchObject({ code: "STATUS_CONFLICT" });
    expect(mockSendTemplateEmail).not.toHaveBeenCalled();
  });

  it("al enviar: el correo lleva el monto, la vigencia y el PDF adjunto", async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue(draft());
    await changeQuotationStatus(reqFor({ id: "q1" }, { status: "ENVIADA" }), createMockRes() as unknown as Response);

    const mail = mockSendTemplateEmail.mock.calls[0][0];
    expect(mail.to).toBe("c@x.cl");
    expect(mail.fallbackHtml).toContain("COTIZ-2026-10-0001");
    expect(mail.fallbackHtml).toContain("119.000");
    expect(mail.fallbackHtml).toContain(future);
    expect(mail.attachments).toEqual([expect.objectContaining({ filename: "COTIZ-2026-10-0001.pdf", contentType: "application/pdf" })]);
  });

  it("si el PDF no se puede generar, el correo sale igual sin adjunto", async () => {
    mockGeneratePdf.mockRejectedValueOnce(new Error("pdf roto"));
    mockPrisma.quotation.findUnique.mockResolvedValue(draft());
    await changeQuotationStatus(reqFor({ id: "q1" }, { status: "ENVIADA" }), createMockRes() as unknown as Response);
    expect(mockSendTemplateEmail).toHaveBeenCalledWith(expect.objectContaining({ attachments: undefined }));
  });
});

describe("deleteQuotation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("responde 404 (no 500) si la cotización no existe", async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue(null);
    await expect(deleteQuotation(reqFor({ id: "x" }), createMockRes() as unknown as Response)).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.quotation.delete).not.toHaveBeenCalled();
  });

  it("no elimina una cotización con pagos asociados", async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue(draft());
    mockPrisma.payment.count.mockResolvedValue(2);
    await expect(deleteQuotation(reqFor({ id: "q1" }), createMockRes() as unknown as Response)).rejects.toMatchObject({ code: "QUOTATION_HAS_PAYMENTS" });
    expect(mockPrisma.quotation.delete).not.toHaveBeenCalled();
  });
});
