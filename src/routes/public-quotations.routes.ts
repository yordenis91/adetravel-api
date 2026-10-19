import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { publicMessageSchema, publicQuestionSchema } from "../validators/public-quotations.validator";
import {
  viewPublicQuotation, downloadPublicQuotationPdf, requestPublicAcceptance, askPublicQuestion, requestPublicRenewal,
} from "../controllers/public-quotations.controller";

/**
 * Rutas SIN sesión: el único acceso es conocer el código del enlace. El código no se valida aquí: uno mal
 * formado se trata igual que uno falso (mismo 404), para no distinguir nada a quien prueba códigos.
 */
export const publicQuotationsRouter = Router();

const limiterOptions = { standardHeaders: true, legacyHeaders: false } as const;
// Lectura: holgada para uso normal, pero frena el barrido de códigos.
const readLimiter = rateLimit({ ...limiterOptions, windowMs: 15 * 60 * 1000, max: env.PUBLIC_READ_RATE_LIMIT_MAX, message: { message: "Demasiadas solicitudes. Inténtalo en unos minutos." } });
// Escritura (aceptar, consultar): pocas por hora y por IP.
const writeLimiter = rateLimit({ ...limiterOptions, windowMs: 60 * 60 * 1000, max: env.PUBLIC_WRITE_RATE_LIMIT_MAX, message: { message: "Demasiadas solicitudes. Inténtalo más tarde." } });
// El PDF es costoso de generar.
const pdfLimiter = rateLimit({ ...limiterOptions, windowMs: 15 * 60 * 1000, max: env.PUBLIC_PDF_RATE_LIMIT_MAX, message: { message: "Demasiadas descargas. Inténtalo en unos minutos." } });

publicQuotationsRouter.get("/:code", readLimiter, asyncHandler(viewPublicQuotation));
publicQuotationsRouter.get("/:code/pdf", pdfLimiter, asyncHandler(downloadPublicQuotationPdf));
publicQuotationsRouter.post("/:code/accept", writeLimiter, validate(publicMessageSchema), asyncHandler(requestPublicAcceptance));
publicQuotationsRouter.post("/:code/question", writeLimiter, validate(publicQuestionSchema), asyncHandler(askPublicQuestion));
publicQuotationsRouter.post("/:code/renew", writeLimiter, validate(publicMessageSchema), asyncHandler(requestPublicRenewal));
