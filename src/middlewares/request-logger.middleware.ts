import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";
import { pathWithoutQuery } from "../utils/pii-scrub";
import { requestContext } from "../utils/request-context";

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Da a cada petición un `requestId` (respeta el `X-Request-Id` que llegue de un proxy si es válido),
 * lo devuelve en la respuesta y registra una línea al terminar: método, ruta sin query, estado,
 * duración y el id del usuario (nunca su correo). El mismo id va en los demás logs y en Sentry.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get("x-request-id");
  const requestId = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", requestId);
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const path = pathWithoutQuery(req.originalUrl);
    const entry = {
      requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Math.round(Number(process.hrtime.bigint() - start) / 1e6),
      ...(req.user?.id ? { userId: req.user.id } : {}),
    };
    // El sondeo de salud de Easypanel (cada 30 s) solo se ve en nivel debug.
    if (path === "/health" || path === "/api/health") logger.debug(entry, "request");
    else if (res.statusCode >= 500) logger.error(entry, "request");
    else if (res.statusCode >= 400) logger.warn(entry, "request");
    else logger.info(entry, "request");
  });

  requestContext.run({ requestId }, () => next());
}
