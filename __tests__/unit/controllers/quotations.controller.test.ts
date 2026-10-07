import { Request, Response } from "express";
import { createMockRes } from "../helpers/prisma-mock";

const mockPrisma = {
  request: { findUnique: jest.fn() },
  service: { findFirst: jest.fn() },
  systemConfig: { findFirst: jest.fn() },
  quotation: { create: jest.fn() },
};

jest.mock("../../../src/lib/prisma", () => ({ prisma: mockPrisma }));
jest.mock("../../../src/services/activity-log.service", () => ({ createActivityLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../src/services/email.service", () => ({ sendTemplateEmail: jest.fn() }));
jest.mock("../../../src/services/numbering.service", () => ({ generateNumber: jest.fn().mockResolvedValue("COTIZ-2026-10-0001") }));
jest.mock("../../../src/services/workflow.service", () => ({ advanceWorkflowStatus: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../src/services/pdf.service", () => ({}));
jest.mock("../../../src/services/agency.service", () => ({}));

import { createQuotation } from "../../../src/controllers/quotations.controller";

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
