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
  PII_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "PII_ENCRYPTION_KEY debe ser un hex de 64 caracteres (32 bytes)")
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
