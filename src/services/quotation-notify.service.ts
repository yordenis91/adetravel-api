import { prisma } from "../lib/prisma";
import { logger } from "../utils/logger";
import { escapeHtml } from "../utils/html";
import { sendEmail } from "./email.service";

export type QuotationNotifyType =
  | "QUOTATION_VIEWED"
  | "QUOTATION_ACCEPT_REQUESTED"
  | "QUOTATION_QUESTION"
  | "QUOTATION_RENEW_REQUESTED"
  | "QUOTATION_UNOPENED"
  | "QUOTATION_EXPIRING"
  | "QUOTATION_SCHEDULED_FAILED";

interface NotifyInput {
  quotation: { id: string; quotationNumber: string; createdBy: string | null };
  /** Quien envió la cotización; si no se conoce, quien la creó. */
  senderId?: string | null;
  type: QuotationNotifyType;
  title: string;
  message: string;
  /** El gerente solo recibe lo que mueve dinero o ventas: aceptaciones y pedidos de cotización vencida. */
  includeManagers?: boolean;
  /** Además del aviso en la campana, un correo al agente (para quien no tiene la aplicación abierta). */
  emailAgent?: boolean;
}

/** Usuarios a avisar: el agente (quien envió o creó) y, si corresponde, los gerentes activos. Sin duplicados. */
async function recipients(input: NotifyInput): Promise<{ id: string; email: string; role: "agent" | "manager" }[]> {
  const ids = new Map<string, "agent" | "manager">();
  const agentId = input.senderId ?? input.quotation.createdBy;
  if (agentId) ids.set(agentId, "agent");
  if (input.includeManagers) {
    const managers = await prisma.user.findMany({ where: { isActive: true, agencyRole: "GERENTE" }, select: { id: true } });
    for (const m of managers) if (!ids.has(m.id)) ids.set(m.id, "manager");
  }
  if (ids.size === 0) return [];
  const users = await prisma.user.findMany({ where: { id: { in: [...ids.keys()] }, isActive: true }, select: { id: true, email: true } });
  return users.map((u) => ({ id: u.id, email: u.email, role: ids.get(u.id)! }));
}

/**
 * Avisa en la campana (y opcionalmente por correo al agente). Nunca lanza: un aviso fallido no debe
 * deshacer lo que el cliente acaba de hacer en la página pública.
 */
export async function notifyQuotationTeam(input: NotifyInput): Promise<void> {
  try {
    const to = await recipients(input);
    if (to.length === 0) return;
    await prisma.notification.createMany({
      data: to.map((u) => ({
        userId: u.id,
        title: input.title,
        message: input.message,
        type: input.type,
        relatedEntityType: "COTIZACION",
        relatedEntityId: input.quotation.id,
      })),
    });
    if (input.emailAgent) {
      for (const u of to.filter((r) => r.role === "agent")) {
        await sendEmail({
          to: u.email,
          subject: `${input.title} — ${input.quotation.quotationNumber}`,
          html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a2e;"><p><strong>${escapeHtml(input.title)}</strong></p><p>${escapeHtml(input.message)}</p><p style="color:#64748b;font-size:12px;">Aviso automático del sistema. Entra a Cotizaciones para ver el detalle.</p></div>`,
        }).catch((error) => logger.warn({ err: (error as Error).message }, "No se pudo enviar el correo de aviso al agente"));
      }
    }
  } catch (error) {
    logger.error({ err: (error as Error).message, type: input.type }, "No se pudo registrar el aviso de la cotización");
  }
}

/** Tarea para el agente, enlazada a la cotización (aparece en Tareas y en el widget del inicio). */
export async function createQuotationTask(input: {
  userId: string | null;
  title: string;
  description: string;
  priority: "ALTA" | "MEDIA" | "BAJA";
  quotation: { id: string; quotationNumber: string };
  dueDate: string;
}): Promise<void> {
  if (!input.userId) return;
  try {
    await prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        priority: input.priority,
        userId: input.userId,
        relatedEntityType: "COTIZACION",
        relatedEntityId: input.quotation.id,
        relatedEntityLabel: input.quotation.quotationNumber,
      },
    });
  } catch (error) {
    logger.error({ err: (error as Error).message }, "No se pudo crear la tarea de la cotización");
  }
}
