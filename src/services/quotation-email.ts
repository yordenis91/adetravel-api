import { prisma } from "../lib/prisma";
import { escapeHtml } from "../utils/html";
import { formatMoney } from "../utils/money";
import { formatDateCL } from "../utils/dates";

interface QuotationForEmail {
  quotationNumber: string;
  currency: string;
  total: number | null;
  validUntil: string | null;
  request?: { destinationCity?: string | null; destinationCountry?: string | null } | null;
}

interface AgencyForEmail {
  name: string;
  email?: string | null;
  phone?: string | null;
}

/** Nombre, correo y teléfono de la agencia tal como se configuran en Configuración > Agencia. */
export async function getAgencyForEmail(): Promise<AgencyForEmail> {
  const config = await prisma.systemConfig.findFirst();
  return {
    name: config?.agencyFantasyName?.trim() || config?.agencyName?.trim() || "ADE Travel",
    email: config?.agencyEmail?.trim() || null,
    phone: config?.agencyPhone?.trim() || null,
  };
}

const totalLabel = (q: QuotationForEmail): string | null =>
  q.total != null ? `${q.currency} ${formatMoney(q.total, q.currency)}` : null;

/** Valores de las variables de la plantilla "Cotización enviada" (ver TEMPLATE_VARIABLES_MAP). */
export function quotationTemplateVariables(q: QuotationForEmail, client: { firstName: string }, agency: AgencyForEmail): Record<string, string> {
  const destination = [q.request?.destinationCity, q.request?.destinationCountry].filter(Boolean).join(", ");
  return {
    client_name: client.firstName,
    quotation_number: q.quotationNumber,
    valid_until: q.validUntil ? formatDateCL(q.validUntil) : "",
    destination,
    total: q.total != null ? formatMoney(q.total, q.currency) : "",
    currency: q.currency,
    agency_name: agency.name,
    agency_email: agency.email ?? "",
    agency_phone: agency.phone ?? "",
  };
}

export type MessageVariant = "both" | "link" | "pdf";

const BODY_LINE: Record<MessageVariant, string> = {
  both: "Puedes ver el detalle en línea desde el botón de abajo; también va adjunto en PDF.",
  link: "Puedes ver el detalle y descargar el PDF desde el botón de abajo.",
  pdf: "Encontrarás el detalle en el PDF adjunto.",
};

/** Texto inicial del mensaje (editable por quien envía). Cambia según se envíe el enlace, el PDF o ambos. */
export function buildDefaultMessage(q: QuotationForEmail, client: { firstName: string }, agency: AgencyForEmail, variant: MessageVariant = "both"): string {
  const total = totalLabel(q);
  const lines = [
    `Hola ${client.firstName},`,
    "",
    `Te enviamos la cotización ${q.quotationNumber}${total ? ` por un total de ${total}` : ""}.${q.validUntil ? ` Es válida hasta el ${formatDateCL(q.validUntil)}.` : ""}`,
    "",
    `${BODY_LINE[variant]} Si tienes cualquier duda o quieres ajustar algo, responde a este correo.`,
    "",
    "Saludos,",
    agency.name,
  ];
  return lines.join("\n");
}

/** Asunto inicial: el de la plantilla activa "Cotización enviada" (con sus variables) o uno por defecto. */
export async function buildDefaultSubject(q: QuotationForEmail, client: { firstName: string }, agency: AgencyForEmail): Promise<string> {
  const template = await prisma.emailTemplate.findFirst({ where: { type: "QUOTATION_SENT", isActive: true } });
  if (!template) return `Cotización ${q.quotationNumber} — ${agency.name}`;
  const variables = quotationTemplateVariables(q, client, agency);
  const subject = Object.entries(variables).reduce((acc, [key, value]) => acc.replace(new RegExp(`{{${key}}}`, "g"), () => value), template.subject);
  return subject.replace(/[\r\n]+/g, " ").trim() || `Cotización ${q.quotationNumber} — ${agency.name}`;
}

/** Texto plano → párrafos HTML (todo escapado; los saltos de línea simples se conservan). */
export function messageToHtml(message: string): string {
  return message
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 14px;line-height:1.6;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Correo completo: mensaje editado por la persona + resumen de la cotización + pie de la agencia. */
export function buildQuotationMessageEmail(message: string, q: QuotationForEmail, agency: AgencyForEmail, onlineUrl?: string): string {
  const total = totalLabel(q);
  const summary = [
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Cotización</td><td style="padding:4px 0;font-weight:bold;">${escapeHtml(q.quotationNumber)}</td></tr>`,
    total ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Total</td><td style="padding:4px 0;font-weight:bold;">${escapeHtml(total)}</td></tr>` : "",
    q.validUntil ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Válida hasta</td><td style="padding:4px 0;">${escapeHtml(formatDateCL(q.validUntil))}</td></tr>` : "",
  ].join("");
  const contact = [agency.email, agency.phone].filter(Boolean).map((v) => escapeHtml(v)).join(" · ");
  return [
    `<div style="font-family:Arial,sans-serif;color:#1a1a2e;font-size:15px;max-width:600px;margin:0 auto;">`,
    `<div style="background:#0F1E3C;color:#fff;padding:16px 24px;font-size:18px;font-weight:bold;">${escapeHtml(agency.name)}</div>`,
    `<div style="padding:24px;border:1px solid #e2e8f0;border-top:0;">`,
    messageToHtml(message),
    `<table style="margin:18px 0;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 14px;width:100%;">${summary}</table>`,
    onlineUrl
      ? `<p style="margin:22px 0 6px;text-align:center;"><a href="${escapeHtml(onlineUrl)}" style="display:inline-block;background:#0F1E3C;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 28px;border-radius:6px;">Ver cotización en línea</a></p><p style="margin:0 0 6px;text-align:center;font-size:12px;color:#64748b;">Si el botón no funciona, copia este enlace en tu navegador:<br><a href="${escapeHtml(onlineUrl)}" style="color:#64748b;word-break:break-all;">${escapeHtml(onlineUrl)}</a></p>`
      : "",
    contact ? `<p style="margin:18px 0 0;font-size:12px;color:#64748b;">${contact}</p>` : "",
    `</div></div>`,
  ].join("");
}
