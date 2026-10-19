import { prisma } from "../lib/prisma";
import { todayISO } from "../utils/dates";
import { notifyQuotationTeam } from "../services/quotation-notify.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNOPENED_AFTER_DAYS = 3;
const EXPIRING_WITHIN_DAYS = 2;

export interface QuotationRemindersResult { unopened: number; expiring: number }

/** Una sola vez por cotización y tipo de aviso (y, en «sin abrir», por enlace): se comprueba en las notificaciones ya creadas. */
async function alreadyNotified(userId: string, type: string, quotationId: string, since?: Date): Promise<boolean> {
  const found = await prisma.notification.findFirst({
    where: { userId, type, relatedEntityId: quotationId, ...(since ? { createdAt: { gte: since } } : {}) },
    select: { id: true },
  });
  return !!found;
}

/**
 * Recordatorios INTERNOS para el agente (no escribe al cliente, que puede resultar molesto):
 *  - «lleva 3 días enviada sin abrir»: llamar o reenviar por otro medio.
 *  - «vence en 2 días y sigue sin aceptarse»: último empujón antes de perder la venta.
 */
export async function runQuotationRemindersJob(now: Date = new Date()): Promise<QuotationRemindersResult> {
  const result: QuotationRemindersResult = { unopened: 0, expiring: 0 };

  const unopenedLinks = await prisma.quotationLink.findMany({
    where: {
      revokedAt: null, expiresAt: { gt: now }, viewCount: 0,
      createdAt: { lte: new Date(now.getTime() - UNOPENED_AFTER_DAYS * DAY_MS) },
      quotation: { status: "ENVIADA" },
    },
    include: { quotation: { include: { client: { select: { firstName: true } } } } },
    take: 200,
  });
  for (const link of unopenedLinks) {
    const q = link.quotation;
    const agentId = link.createdBy ?? q.createdBy;
    if (!agentId || (await alreadyNotified(agentId, "QUOTATION_UNOPENED", q.id, link.createdAt))) continue;
    await notifyQuotationTeam({
      quotation: q, senderId: agentId, type: "QUOTATION_UNOPENED",
      title: "Cotización sin abrir",
      message: `${q.client.firstName} no ha abierto la cotización ${q.quotationNumber} en ${UNOPENED_AFTER_DAYS} días. Prueba con una llamada o reenviándola por WhatsApp.`,
    });
    result.unopened += 1;
  }

  const today = todayISO(undefined, now);
  const limit = todayISO(undefined, new Date(now.getTime() + EXPIRING_WITHIN_DAYS * DAY_MS));
  const expiring = await prisma.quotation.findMany({
    where: { status: "ENVIADA", validUntil: { gte: today, lte: limit }, createdBy: { not: null } },
    include: { client: { select: { firstName: true } }, links: { where: { revokedAt: null }, select: { createdBy: true, acceptanceRequestedAt: true } } },
    take: 200,
  });
  for (const q of expiring) {
    // Si el cliente ya pidió aceptar, ya hay una tarea en curso: no insistir.
    if (q.links.some((l) => l.acceptanceRequestedAt)) continue;
    const agentId = q.links[0]?.createdBy ?? q.createdBy;
    if (!agentId || (await alreadyNotified(agentId, "QUOTATION_EXPIRING", q.id))) continue;
    await notifyQuotationTeam({
      quotation: q, senderId: agentId, type: "QUOTATION_EXPIRING",
      title: "Cotización por vencer",
      message: `La cotización ${q.quotationNumber} de ${q.client.firstName} vence el ${q.validUntil} y sigue sin aceptarse.`,
    });
    result.expiring += 1;
  }
  return result;
}
