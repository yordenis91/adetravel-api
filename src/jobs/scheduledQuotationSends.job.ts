import { prisma } from "../lib/prisma";
import { logger } from "../utils/logger";
import { ApiError } from "../utils/api-error";
import { createActivityLog } from "../services/activity-log.service";
import { sendQuotationNow, type QuotationSendOptions } from "../services/quotation-send.service";
import { notifyQuotationTeam } from "../services/quotation-notify.service";

const MAX_ATTEMPTS = 3;
/** Un envío «en proceso» hace más de esto se da por caído (reinicio del API a mitad) y se reintenta. */
const STALE_CLAIM_MS = 10 * 60 * 1000;
/** Errores que reintentar no arregla: se marcan fallidos de inmediato y se avisa a quien lo programó. */
const PERMANENT = new Set(["QUOTATION_NOT_SENDABLE", "REQUEST_CANCELLED", "QUOTATION_EXPIRED", "QUOTATION_NOT_FOUND", "EMAIL_NOT_SENT", "NO_RECIPIENTS"]);

export interface ScheduledSendsResult { sent: number; failed: number; retried: number }

/** Despacha los envíos programados cuya hora ya llegó. Corre cada minuto; sobrevive a reinicios porque vive en la base. */
export async function runScheduledQuotationSendsJob(now: Date = new Date()): Promise<ScheduledSendsResult> {
  const result: ScheduledSendsResult = { sent: 0, failed: 0, retried: 0 };
  // Recupera los que quedaron «en proceso» por una caída.
  await prisma.scheduledQuotationSend.updateMany({
    where: { status: "PROCESANDO", claimedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
    data: { status: "PENDIENTE" },
  });
  const due = await prisma.scheduledQuotationSend.findMany({ where: { status: "PENDIENTE", sendAt: { lte: now } }, orderBy: { sendAt: "asc" }, take: 20 });

  for (const job of due) {
    // Reclamo atómico: si hubiera dos réplicas, solo una se lo queda.
    const claimed = await prisma.scheduledQuotationSend.updateMany({
      where: { id: job.id, status: "PENDIENTE" },
      data: { status: "PROCESANDO", claimedAt: now, attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;
    const attempts = job.attempts + 1;
    try {
      await sendQuotationNow(job.quotationId, job.payload as unknown as QuotationSendOptions, job.createdBy);
      await prisma.scheduledQuotationSend.update({ where: { id: job.id }, data: { status: "ENVIADO", sentAt: new Date(), lastError: null } });
      result.sent += 1;
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      const message = (error as Error).message;
      const permanent = (code && PERMANENT.has(code)) || attempts >= MAX_ATTEMPTS;
      if (!permanent) {
        await prisma.scheduledQuotationSend.update({ where: { id: job.id }, data: { status: "PENDIENTE", lastError: message, sendAt: new Date(now.getTime() + 5 * 60 * 1000) } });
        result.retried += 1;
        continue;
      }
      await prisma.scheduledQuotationSend.update({ where: { id: job.id }, data: { status: "FALLIDO", lastError: message } });
      result.failed += 1;
      const quotation = await prisma.quotation.findUnique({ where: { id: job.quotationId }, select: { id: true, quotationNumber: true, createdBy: true } });
      if (quotation) {
        await notifyQuotationTeam({
          quotation, senderId: job.createdBy, type: "QUOTATION_SCHEDULED_FAILED",
          title: "No se pudo enviar una cotización programada",
          message: `El envío programado de ${quotation.quotationNumber} no salió: ${message}`,
        });
        await createActivityLog({ action: "UPDATE", entityType: "Quotation", entityId: quotation.id, entityLabel: quotation.quotationNumber, description: `Envío programado fallido: ${message}`, performedBy: job.createdBy });
      }
      logger.warn({ jobId: job.id, code, message }, "[jobs] envío programado de cotización fallido");
    }
  }
  return result;
}
