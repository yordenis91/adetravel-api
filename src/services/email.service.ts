import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { decryptPII } from "../lib/pii-encryption";

async function resolveSmtpSettings() {
  const config = await prisma.systemConfig.findFirst();

  const host = config?.smtpHost || env.SMTP_HOST;
  const port = config?.smtpPort || env.SMTP_PORT;
  const user = config?.smtpUser || env.SMTP_USER;
  // Guardada cifrada; decryptPII devuelve tal cual una contraseña antigua aún en texto plano.
  const pass = decryptPII(config?.smtpPassword) || env.SMTP_PASS;
  const fromEmail = config?.smtpFromEmail || env.SMTP_FROM;
  const fromName = config?.smtpFromName;
  // La config guardada en la app (SystemConfig) manda sobre las variables de
  // entorno; estas últimas quedan como respaldo si nunca se configuró desde la UI.
  const encryption = (config?.smtpEncryption || "TLS").toUpperCase();

  if (!host || !port || !user || !pass || !fromEmail) return null;

  return {
    host,
    port,
    secure: encryption === "SSL",
    auth: { user, pass },
    from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail
  };
}

/** "ana.perez@gmail.com" → "a***@gmail.com": para registrar envíos sin guardar la dirección completa. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Decide a quién se envía según EMAIL_DELIVERY (ver config/env.ts). La demo trabaja con datos
 * que pueden ser de clientes reales: con "redirect" ningún correo sale hacia ellos.
 */
export function resolveDelivery(
  to: string,
  subject: string,
  mode: "live" | "redirect" | "off" = env.EMAIL_DELIVERY,
  redirectTo: string | undefined = env.EMAIL_REDIRECT_TO
): { send: false } | { send: true; to: string; subject: string } {
  if (mode === "off") return { send: false };
  if (mode === "redirect") {
    if (!redirectTo) return { send: false };
    return { send: true, to: redirectTo, subject: `[${env.NODE_ENV} → ${to}] ${subject}` };
  }
  return { send: true, to, subject };
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const delivery = resolveDelivery(options.to, options.subject);
  if (!delivery.send) {
    logger.info({ to: maskEmail(options.to), mode: env.EMAIL_DELIVERY }, "Email no enviado (EMAIL_DELIVERY)");
    return;
  }

  const smtp = await resolveSmtpSettings();
  if (!smtp) {
    logger.warn("SMTP not configured. Email skipped.");
    return;
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth
  });

  await transport.sendMail({
    from: smtp.from,
    to: delivery.to,
    subject: delivery.subject,
    html: options.html,
    ...(options.attachments?.length ? { attachments: options.attachments } : {})
  });
  logger.info({ to: maskEmail(options.to), mode: env.EMAIL_DELIVERY }, "Email enviado");
}

export async function sendTemplateEmail(options: {
  type: string;
  to: string;
  variables?: Record<string, string>;
  fallbackSubject: string;
  fallbackHtml: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const template = await prisma.emailTemplate.findFirst({
    where: { type: options.type, isActive: true }
  });

  const variables = options.variables ?? {};
  const interpolate = (text: string) =>
    Object.entries(variables).reduce(
      (acc, [key, value]) => acc.replace(new RegExp(`{{${key}}}`, "g"), value),
      text
    );

  await sendEmail({
    to: options.to,
    subject: interpolate(template?.subject ?? options.fallbackSubject),
    html: interpolate(template?.bodyHtml ?? options.fallbackHtml),
    attachments: options.attachments
  });
}
