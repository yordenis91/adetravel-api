import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const transport =
  env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
      })
    : null;

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!transport || !env.SMTP_FROM) {
    logger.warn("SMTP not configured. Email skipped.");
    return;
  }

  await transport.sendMail({
    from: env.SMTP_FROM,
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
