import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { decryptPII } from "../lib/pii-encryption";
import { escapeHtml } from "../utils/html";

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

/** Resultado de un envío: `sent: false` explica por qué no salió nada (sin error, para que quien llama lo diga con honestidad). */
export type SendEmailResult =
  | { sent: true }
  | { sent: false; reason: "delivery-off" | "no-smtp" };

export async function sendEmail(options: {
  to: string | string[];
  /** Copia visible y copia oculta. En modo "redirect" se omiten: la salvaguarda manda todo a una sola casilla de pruebas. */
  cc?: string[];
  bcc?: string[];
  /** Dirección a la que llegan las respuestas del cliente (p. ej. el agente que envió la cotización). */
  replyTo?: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<SendEmailResult> {
  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const label = recipients.join(", ");
  const delivery = resolveDelivery(label, options.subject);
  if (!delivery.send) {
    logger.info({ to: recipients.map(maskEmail), mode: env.EMAIL_DELIVERY }, "Email no enviado (EMAIL_DELIVERY)");
    return { sent: false, reason: "delivery-off" };
  }
  // En "live" salen a todos los destinatarios; en "redirect" resolveDelivery ya los cambió por uno solo.
  const redirected = delivery.to !== label;
  const to = redirected ? delivery.to : recipients;

  const smtp = await resolveSmtpSettings();
  if (!smtp) {
    logger.warn("SMTP not configured. Email skipped.");
    return { sent: false, reason: "no-smtp" };
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth
  });

  await transport.sendMail({
    from: smtp.from,
    to,
    subject: delivery.subject,
    html: options.html,
    ...(!redirected && options.cc?.length ? { cc: options.cc } : {}),
    ...(!redirected && options.bcc?.length ? { bcc: options.bcc } : {}),
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    ...(options.attachments?.length ? { attachments: options.attachments } : {})
  });
  logger.info({ to: recipients.map(maskEmail), mode: env.EMAIL_DELIVERY }, "Email enviado");
  return { sent: true };
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
  // Reemplazo con función: un valor con "$&" o "$1" (p. ej. un monto "$2.450.000") no debe interpretarse como patrón.
  // En el cuerpo HTML los valores se escapan (un nombre con "<" no debe romper ni inyectar nada); en el asunto, no.
  const interpolate = (text: string, escape: boolean) =>
    Object.entries(variables).reduce(
      (acc, [key, value]) => acc.replace(new RegExp(`{{${key}}}`, "g"), () => (escape ? escapeHtml(value) : value)),
      text
    );

  await sendEmail({
    to: options.to,
    subject: interpolate(template?.subject ?? options.fallbackSubject, false),
    html: interpolate(template?.bodyHtml ?? options.fallbackHtml, true),
    attachments: options.attachments
  });
}
