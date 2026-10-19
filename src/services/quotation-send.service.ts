import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { ApiError } from "../utils/api-error";
import { logger } from "../utils/logger";
import { isExpired } from "../utils/dates";
import { createActivityLog } from "./activity-log.service";
import { sendEmail, maskEmail } from "./email.service";
import { generateQuotationPdfBuffer } from "./pdf.service";
import { advanceWorkflowStatus } from "./workflow.service";
import { buildQuotationMessageEmail, getAgencyForEmail } from "./quotation-email";
import { buildLinkUrl, getOrCreateActiveLink } from "./quotation-link.service";

export const SENDABLE_STATUSES = ["BORRADOR", "ENVIADA"];

export interface QuotationSendOptions {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  message: string;
  attachPdf: boolean;
  includeLink: boolean;
}

export async function loadQuotationForEmail(id: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: { client: true, request: { select: { status: true, destinationCity: true, destinationCountry: true } } },
  });
  if (!quotation) throw new ApiError("Cotización no encontrada", 404, "QUOTATION_NOT_FOUND");
  return quotation;
}

/** Reglas para poder enviar; se comprueban al pedir el envío y de nuevo cuando un envío programado le toca salir. */
export function assertQuotationSendable(existing: { status: string; validUntil: string | null; request?: { status: string } | null }): void {
  if (!SENDABLE_STATUSES.includes(existing.status)) {
    throw new ApiError(`Una cotización en estado ${existing.status} no se puede enviar`, 409, "QUOTATION_NOT_SENDABLE");
  }
  if (existing.request?.status === "CANCELADA") {
    throw new ApiError("La solicitud está cancelada: no se puede enviar la cotización", 409, "REQUEST_CANCELLED");
  }
  if (env.BLOCK_EXPIRED_QUOTATIONS && isExpired(existing.validUntil)) {
    throw new ApiError(`La cotización venció el ${existing.validUntil}. Actualiza la fecha de validez antes de enviarla.`, 409, "QUOTATION_EXPIRED");
  }
}

/** Quita direcciones repetidas (sin distinguir mayúsculas): una persona no recibe el mismo correo como Para y como CC. */
export function dedupeRecipients(options: Pick<QuotationSendOptions, "to" | "cc" | "bcc">) {
  const seen = new Set<string>();
  const take = (list: string[]) => list.filter((email) => {
    const key = email.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const to = take(options.to);
  return { to, cc: take(options.cc), bcc: take(options.bcc) };
}

export interface QuotationSendResult {
  statusChanged: boolean;
  recipients: number;
  linkUrl: string | null;
}

/**
 * Envía la cotización ahora. Si estaba en Borrador pasa a Enviada; si ya estaba Enviada es un reenvío.
 * Solo se cambia el estado si el correo realmente salió. Lo usan el envío inmediato y el programado.
 */
export async function sendQuotationNow(id: string, options: QuotationSendOptions, sentBy: string): Promise<QuotationSendResult> {
  const existing = await loadQuotationForEmail(id);
  assertQuotationSendable(existing);
  const { to, cc, bcc } = dedupeRecipients(options);
  if (to.length === 0) throw new ApiError("Indica al menos un destinatario", 400, "NO_RECIPIENTS");

  // Sin PDF no se envía si el PDF era parte del envío: la persona espera que el cliente lo reciba.
  let attachments: { filename: string; content: Buffer; contentType: string }[] | undefined;
  if (options.attachPdf) {
    try {
      const pdf = await generateQuotationPdfBuffer({ ...existing, client: existing.client });
      attachments = [{ filename: `${existing.quotationNumber}.pdf`, content: pdf, contentType: "application/pdf" }];
    } catch (e) {
      logger.error({ err: e, quotationId: id }, "No se pudo generar el PDF para enviar la cotización");
      throw new ApiError("No se pudo generar el PDF de la cotización. No se envió nada.", 500, "PDF_FAILED");
    }
  }

  // El enlace se crea antes de enviar para ponerlo en el correo; si el envío falla queda sin usar (no se muestra a nadie).
  const link = options.includeLink ? await getOrCreateActiveLink(id, existing.validUntil, sentBy) : null;
  const linkUrl = link ? buildLinkUrl(link.id) : null;

  const sender = await prisma.user.findUnique({ where: { id: sentBy }, select: { email: true } });
  const agency = await getAgencyForEmail();
  let result;
  try {
    result = await sendEmail({
      to,
      cc,
      bcc,
      replyTo: sender?.email,
      subject: options.subject,
      html: buildQuotationMessageEmail(options.message, existing, agency, linkUrl ?? undefined),
      attachments,
    });
  } catch (e) {
    logger.error({ err: e, quotationId: id }, "Error enviando la cotización por correo");
    throw new ApiError("No se pudo enviar el correo. Revisa la configuración del correo (SMTP) e inténtalo de nuevo.", 502, "EMAIL_SEND_FAILED");
  }
  if (!result.sent) {
    throw new ApiError(
      result.reason === "delivery-off"
        ? "El envío de correos está desactivado en este entorno: no se envió nada."
        : "El correo (SMTP) no está configurado: ve a Configuración > Email. No se envió nada.",
      409,
      "EMAIL_NOT_SENT"
    );
  }

  let statusChanged = false;
  if (existing.status === "BORRADOR") {
    const swapped = await prisma.quotation.updateMany({ where: { id, status: "BORRADOR" }, data: { status: "ENVIADA" } });
    statusChanged = swapped.count > 0;
    if (statusChanged) await advanceWorkflowStatus(existing.requestId, existing.serviceId, "ENVIADO_AL_CLIENTE");
  }

  const extras = [cc.length ? `CC ${cc.length}` : "", bcc.length ? `CCO ${bcc.length}` : "", linkUrl ? "con enlace en línea" : "", attachments ? "con PDF" : "sin PDF"].filter(Boolean).join(", ");
  await createActivityLog({
    action: "UPDATE",
    entityType: "Quotation",
    entityId: id,
    entityLabel: existing.quotationNumber,
    description: `${statusChanged ? "Enviada por correo (Borrador -> Enviada)" : "Reenviada por correo"} a ${to.map(maskEmail).join(", ")} (${extras})`,
    performedBy: sentBy,
  });
  return { statusChanged, recipients: to.length + cc.length + bcc.length, linkUrl };
}
