import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { logger } from "../utils/logger";

async function resolveSmtpSettings() {
  const config = await prisma.systemConfig.findFirst();

  const host = config?.smtpHost || env.SMTP_HOST;
  const port = config?.smtpPort || env.SMTP_PORT;
  const user = config?.smtpUser || env.SMTP_USER;
  const pass = config?.smtpPassword || env.SMTP_PASS;
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

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
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
    to: options.to,
    subject: options.subject,
    html: options.html
  });
}

export async function sendTemplateEmail(options: {
  type: string;
  to: string;
  variables?: Record<string, string>;
  fallbackSubject: string;
  fallbackHtml: string;
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
    html: interpolate(template?.bodyHtml ?? options.fallbackHtml)
  });
}
