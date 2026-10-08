/**
 * Filtrado de datos personales para logs y Sentry (fase 4 de preproducción).
 *
 * Los logs y los eventos de error no deben llevar correos, teléfonos, RUT, pasaportes, contraseñas
 * ni tokens. Se identifica a las personas por su id (userId, clientId), nunca por sus datos.
 */

export const REDACTED = "[filtrado]";

/** Claves cuyo valor nunca se registra (comparación sin mayúsculas ni guiones). */
const SENSITIVE_KEYS = new Set(
  [
    "password", "newPassword", "currentPassword", "passwordHash", "token", "accessToken", "refreshToken",
    "authorization", "cookie", "set-cookie", "secret", "apiKey", "smtpPass", "jwt",
    "email", "to", "cc", "bcc", "from", "replyTo", "envelope", "recipient", "recipients",
    "phone", "mobile", "rut", "dni", "passport", "passportNumber", "address", "birthDate",
    "bankAccount", "bankAccountNumber", "bankAccountHolder", "firstName", "lastName", "fullName",
    "passengerNames",
  ].map(normalizeKey)
);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, "");
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// RUT chileno con o sin puntos (12.345.678-9 / 12345678-K)
const RUT_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/g;

/** Enmascara correos, RUT y tokens Bearer dentro de un texto libre (mensajes de error, URLs). */
export function maskText(text: string): string {
  return text.replace(EMAIL_RE, "[correo]").replace(RUT_RE, "[rut]").replace(BEARER_RE, "Bearer [token]");
}

/**
 * Copia profunda con las claves sensibles filtradas y los textos enmascarados. Corta ciclos y
 * profundidad excesiva para no colgar el log con objetos enormes (p. ej. un error de Prisma).
 */
export function scrub<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (typeof value === "string") return maskText(value) as unknown as T;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Error) return errorToSafeObject(value) as unknown as T;
  if (depth > 6) return "[profundidad]" as unknown as T;
  if (seen.has(value as object)) return "[ciclo]" as unknown as T;
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1, seen)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : scrub(v, depth + 1, seen);
  }
  return out as T;
}

/** Error como objeto plano sin datos personales: tipo, código, mensaje y pila enmascarados. */
export function errorToSafeObject(err: Error): Record<string, unknown> {
  const e = err as Error & { code?: unknown; statusCode?: unknown };
  return {
    type: e.name,
    message: maskText(e.message ?? ""),
    ...(e.code !== undefined ? { code: e.code } : {}),
    ...(e.statusCode !== undefined ? { statusCode: e.statusCode } : {}),
    ...(e.stack ? { stack: maskText(e.stack) } : {}),
  };
}

/** Ruta sin query string: los filtros de búsqueda pueden llevar nombres o correos. */
export function pathWithoutQuery(url: string): string {
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}
