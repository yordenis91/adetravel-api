import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import * as Sentry from "@sentry/node";
import { ApiError } from "../utils/api-error";
import { logger } from "../utils/logger";
import { sendError } from "../utils/response";
import { currentRequestId } from "../utils/request-context";

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

  // Violación de restricción única de Prisma (p.ej. dos altas simultáneas que obtuvieron el
  // mismo correlativo): es un conflicto reintentable, no un error del servidor.
  if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002") {
    sendError(res, "El registro ya existe o se creó al mismo tiempo. Intenta de nuevo.", "DUPLICATE_RECORD", 409);
    return;
  }

  logger.error({ err }, "Unhandled error");
  // El mismo requestId que el log y la cabecera X-Request-Id, para cruzar Sentry con los logs.
  const requestId = currentRequestId();
  if (requestId) Sentry.captureException(err, { tags: { request_id: requestId } });
  else Sentry.captureException(err);
  sendError(res, "Error interno del servidor", "INTERNAL_SERVER_ERROR", 500);
}
