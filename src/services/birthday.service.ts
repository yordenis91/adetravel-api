import { prisma } from "../lib/prisma";
import { logger } from "../utils/logger";
import { renderTemplateEmail, sendEmail } from "./email.service";
import { getAgencyForEmail, messageToHtml, type AgencyForEmail } from "./quotation-email";
import { birthdayTemplateVariables } from "./email-template-variables";

export const DEFAULT_BIRTHDAY_SUBJECT = "¡Feliz cumpleaños, {{client_name}}! 🎂";

/** Diseño por defecto de la felicitación (el mismo de la vista previa del panel); `{{message}}` lleva el saludo editable. */
export const DEFAULT_BIRTHDAY_HTML = `<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #f1f5f9; border-radius: 16px; overflow: hidden;">
  <div style="background-color: #0f172a; padding: 30px 20px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-family: Georgia, serif;">¡Feliz Cumpleaños!</h1>
  </div>
  <div style="padding: 30px 20px; background-color: #ffffff; text-align: center;">
    <p style="font-size: 18px; color: #334155; margin-bottom: 20px;">Estimado/a <strong>{{client_full_name}}</strong>,</p>
    <div style="color: #64748b; line-height: 1.6; margin-bottom: 30px;">{{message}}</div>
    <div style="display: inline-block; padding: 12px 24px; background-color: #f8fafc; color: #0f172a; border-radius: 8px; font-weight: bold; border: 1px solid #e2e8f0;">🎉 ¡Disfruta tu día al máximo!</div>
  </div>
  <div style="background-color: #f8fafc; padding: 15px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9;">{{agency_name}}</div>
</div>`;

export const defaultBirthdayMessage = (agency: AgencyForEmail) =>
  `En nombre de todo el equipo de ${agency.name}, queremos desearte un día maravilloso lleno de alegría y rodeado de tus seres queridos. ¡Que este nuevo año de vida venga cargado de nuevos viajes y aventuras inolvidables!`;

type BirthdayClient = { firstName: string; lastName?: string | null };

/** Correo de felicitación tal como saldrá: plantilla activa (o el diseño por defecto) con el saludo, editado o no. */
export async function renderBirthdayEmail(client: BirthdayClient, customMessage?: string | null, agency?: AgencyForEmail) {
  const ag = agency ?? (await getAgencyForEmail());
  const message = customMessage?.trim() || defaultBirthdayMessage(ag);
  const rendered = await renderTemplateEmail({
    type: "BIRTHDAY_GREETING",
    variables: birthdayTemplateVariables(client, ag),
    htmlVariables: { message: messageToHtml(message) },
    fallbackSubject: DEFAULT_BIRTHDAY_SUBJECT,
    fallbackHtml: DEFAULT_BIRTHDAY_HTML,
  });
  return { subject: rendered.subject, html: rendered.html, message };
}

export type BirthdayOutcome = "sent" | "already-sent" | "no-email" | "not-found" | "not-delivered" | "failed";
export interface BirthdayResult { clientId: string; outcome: BirthdayOutcome }

/**
 * Envía la felicitación a cada cliente (una vez por año). Reclama el año de forma atómica antes de enviar —dos clics
 * seguidos no duplican el correo— y lo devuelve si el correo no salió, para poder reintentar.
 */
export async function sendBirthdayGreetings(clientIds: string[], messages: Record<string, string> = {}): Promise<BirthdayResult[]> {
  const year = new Date().getFullYear();
  const agency = await getAgencyForEmail();
  const clients = await prisma.client.findMany({ where: { id: { in: clientIds } } });
  const byId = new Map(clients.map((c) => [c.id, c]));
  const results: BirthdayResult[] = [];

  for (const clientId of [...new Set(clientIds)]) {
    const client = byId.get(clientId);
    if (!client) { results.push({ clientId, outcome: "not-found" }); continue; }
    if (!client.email) { results.push({ clientId, outcome: "no-email" }); continue; }

    const claim = await prisma.client.updateMany({
      where: { id: clientId, OR: [{ lastBirthdayEmailYear: null }, { lastBirthdayEmailYear: { not: year } }] },
      data: { lastBirthdayEmailYear: year },
    });
    if (claim.count === 0) { results.push({ clientId, outcome: "already-sent" }); continue; }

    const release = () => prisma.client.updateMany({ where: { id: clientId }, data: { lastBirthdayEmailYear: client.lastBirthdayEmailYear } });
    try {
      const { subject, html } = await renderBirthdayEmail(client, messages[clientId], agency);
      const sent = await sendEmail({ to: client.email, subject, html });
      if (sent.sent) results.push({ clientId, outcome: "sent" });
      else { await release(); results.push({ clientId, outcome: "not-delivered" }); }
    } catch (err) {
      logger.error({ err, clientId }, "Error enviando saludo de cumpleaños");
      await release();
      results.push({ clientId, outcome: "failed" });
    }
  }
  return results;
}
