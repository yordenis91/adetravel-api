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
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().default(15),
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

export const env = parsed.data;
