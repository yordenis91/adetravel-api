import { Request } from "express";
import jwt from "jsonwebtoken";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env";

// Clave del limitador global. Una agencia entera suele salir por una sola IP de
// oficina, así que contar por IP hace que todo el equipo comparta un mismo cupo y
// reciba 429 a la vez. Con un token válido se cuenta por usuario; sin token (o con
// uno inválido) se sigue contando por IP, así que mandar tokens falsos no evade el límite.
export function apiRateLimitKey(req: Request): string {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(header.slice(7), env.JWT_SECRET) as jwt.JwtPayload;
      if (typeof decoded.id === "string") return `user:${decoded.id}`;
    } catch {
      // token inválido o expirado: cae al conteo por IP
    }
  }
  return `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

// Rate limit para login: solo cuentan los intentos fallidos (skipSuccessfulRequests),
// así el uso normal no se bloquea pero la fuerza bruta de contraseñas sí.
export const loginLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.LOGIN_RATE_LIMIT_MAX,
  message: "Demasiados intentos de inicio de sesión. Por favor, intenta de nuevo más tarde.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Rate limit para forgot-password: máximo 5 solicitudes por hora por IP
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5, // 5 solicitudes
  message: "Has intentado demasiadas veces. Por favor, intenta de nuevo en una hora.",
  standardHeaders: true,
  legacyHeaders: false
  // Sin excepciones: antes se saltaba el límite si el correo coincidía con ADMIN_EMAIL, y sin esa
  // variable (como en producción) también cuando el cuerpo no traía correo (undefined === undefined).
  // Así cualquiera podía inundar de correos de recuperación al administrador.
});

// Rate limit para reset-password: máximo 3 intentos por hora por IP
export const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // 3 intentos
  message: "Has intentado demasiadas veces. Por favor, intenta de nuevo en una hora.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit para validate-reset-token: máximo 10 validaciones por hora por IP
export const validateTokenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // 10 validaciones
  message: "Demasiados intentos de validación. Por favor, intenta de nuevo más tarde.",
  standardHeaders: true,
  legacyHeaders: false,
});
