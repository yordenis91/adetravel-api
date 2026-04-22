import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/api-error";
import { logger } from "../utils/logger";
import { sendError } from "../utils/response";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    sendError(res, err.message, err.code, err.statusCode);
    return;
  }

  if (err instanceof ZodError) {
    sendError(res, err.issues[0]?.message ?? "Error de validación", "VALIDATION_ERROR", 400);
    return;
  }

  logger.error({ err }, "Unhandled error");
  sendError(res, "Error interno del servidor", "INTERNAL_SERVER_ERROR", 500);
}
