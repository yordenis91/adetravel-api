import { ZodError, z } from "zod";
import { Request, Response } from "express";
import { ApiError } from "../../../src/utils/api-error";
import { createMockRes } from "../helpers/prisma-mock";

const mockCaptureException = jest.fn();
jest.mock("@sentry/node", () => ({ captureException: mockCaptureException }));

import { errorHandler } from "../../../src/middlewares/error-handler.middleware";

describe("errorHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("responde con el statusCode/code de un ApiError y NO reporta a Sentry", () => {
    const res = createMockRes();
    const err = new ApiError("Pago no encontrado", 404, "PAYMENT_NOT_FOUND");

    errorHandler(err, {} as Request, res as unknown as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Pago no encontrado", code: "PAYMENT_NOT_FOUND" });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("responde 400 VALIDATION_ERROR para un ZodError y NO reporta a Sentry", () => {
    const res = createMockRes();
    const zodError = z.object({ name: z.string() }).safeParse({});
    expect(zodError.success).toBe(false);

    errorHandler((zodError as any).error as ZodError, {} as Request, res as unknown as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VALIDATION_ERROR" })
    );
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("responde 500 INTERNAL_SERVER_ERROR para un error inesperado y SÍ lo reporta a Sentry", () => {
    const res = createMockRes();
    const err = new Error("Fallo de conexión a la base de datos");

    errorHandler(err, {} as Request, res as unknown as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" })
    );
    expect(mockCaptureException).toHaveBeenCalledWith(err);
  });
});
