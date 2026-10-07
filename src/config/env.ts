import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("1d"),
  FRONTEND_URL: z.string().url().default("http://localhost:8080"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  // Límite global de /api por usuario (por IP si no hay sesión). Cada pantalla del cliente hace
  // 7-14 llamadas y las notificaciones se consultan cada 30 s: con 100 por ventana un uso normal
  // agotaba el cupo en unas 12 pantallas y el usuario era expulsado (fase 3, defecto D2).
  RATE_LIMIT_MAX: z.coerce.number().default(1000),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().default(15),
  // Límite propio de /auth/login: solo cuenta intentos fallidos por IP.
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(10),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().default(15),
  // El registro público (POST /auth/register) queda apagado salvo que se active
  // explícitamente: en producción los usuarios entran por invitación (/auth/invite).
  ALLOW_PUBLIC_REGISTRATION: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // DECISIONES DE NEGOCIO ASUMIDAS (pendientes de confirmar con el dueño de la agencia; ver
  // DECISIONES_PENDIENTES.md). Se cambian con una variable de entorno, sin tocar código.
  // - Pagos parciales: apagado. Cada pago debe ser por el total de la cotización aceptada.
  ALLOW_PARTIAL_PAYMENTS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // - Cotizaciones vencidas: bloquean enviar y aceptar.
  BLOCK_EXPIRED_QUOTATIONS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Salvaguarda de correo por entorno. "live": se envía a los destinatarios reales (producción).
  // "redirect": todo va a EMAIL_REDIRECT_TO, con el destinatario original en el asunto (demo y
  // pruebas con datos que pueden ser reales). "off": no se envía nada, solo se registra.
  EMAIL_DELIVERY: z.enum(["live", "redirect", "off"]).default("live"),
  EMAIL_REDIRECT_TO: z.string().email().optional(),
  SENTRY_DSN: z.string().optional(),
  // Clave AES-256 (32 bytes en hex, 64 caracteres) para cifrar PII sensible
  // de Cliente (pasaporte, cuenta bancaria) en reposo. Ver src/lib/pii-encryption.ts.
  PII_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "PII_ENCRYPTION_KEY debe ser un hex de 64 caracteres (32 bytes)"),
  // Backup automático de la base a un bucket S3-compatible (ej. MinIO en Easypanel).
  // Todos opcionales: si falta alguno, el cron de backup simplemente no se registra
  // (ver src/jobs/index.ts) en vez de tirar abajo el arranque del servidor.
  BACKUP_S3_ENDPOINT: z.string().url().optional(),
  BACKUP_S3_BUCKET: z.string().min(1).optional(),
  BACKUP_S3_REGION: z.string().min(1).default("us-east-1"),
  BACKUP_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  BACKUP_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  BACKUP_CRON: z.string().default("0 3 * * *"),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(30)
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}
if (parsed.data.EMAIL_DELIVERY === "redirect" && !parsed.data.EMAIL_REDIRECT_TO) {
  throw new Error("Invalid environment variables: EMAIL_DELIVERY=redirect exige EMAIL_REDIRECT_TO");
}

export const env = parsed.data;

/**
 * Motivo por el que JWT_SECRET parece débil, o null. No impide arrancar (un secreto corto en
 * producción no debe tumbar el servicio en un despliegue), pero se avisa en el log al iniciar.
 * Con HS256, un secreto corto o repetitivo permite falsificar sesiones por fuerza bruta.
 */
export function weakJwtSecretReason(secret: string): string | null {
  if (secret.length < 32) return `tiene ${secret.length} caracteres (mínimo recomendado: 32)`;
  if (new Set(secret).size < 10) return "tiene muy pocos caracteres distintos";
  return null;
}
