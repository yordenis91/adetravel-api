import { prisma } from "../lib/prisma";
import { createActivityLog } from "../services/activity-log.service";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface OverdueCheck {
  /** Tag usado como Notification.relatedEntityType, para deduplicar y para trazabilidad. */
  type: string;
  status: string;
  title: string;
  message: (requestNumber: string) => string;
}

// Las 3 notificaciones automáticas de la sección 6.12 del documento de requisitos: cada una
// dispara cuando una Solicitud lleva más de 1 día (24h) en el estado indicado.
const CHECKS: OverdueCheck[] = [
  {
    type: "REQUEST_OVERDUE_PAYMENT",
    status: "ENVIADA_SOLICITUD_PAGO_CLIENTE",
    title: "Pago pendiente con retraso",
    message: (n) => `La solicitud ${n} lleva más de 1 día esperando el pago del cliente.`,
  },
  {
    type: "REQUEST_OVERDUE_PROVIDER_CONFIRMATION",
    status: "ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR",
    title: "Confirmación de proveedor atrasada",
    message: (n) => `La solicitud ${n} lleva más de 1 día esperando la confirmación del proveedor.`,
  },
  {
    type: "REQUEST_OVERDUE_CLIENT_ACCEPTANCE",
    status: "ENVIADO_AL_CLIENTE",
    title: "Aceptación del cliente atrasada",
    message: (n) => `La solicitud ${n} lleva más de 1 día esperando la aceptación del cliente.`,
  },
];

export interface OverdueNotificationsResult {
  created: number;
  skipped: number;
  checked: number;
}

/**
 * Recorre las 3 condiciones de atraso del documento y crea una Notification por cada
 * Solicitud que aplique — una sola vez por permanencia en ese estado (ver deduplicación
 * más abajo), sin necesitar una columna nueva en el esquema.
 */
export async function runOverdueNotificationsJob(): Promise<OverdueNotificationsResult> {
  const cutoff = new Date(Date.now() - ONE_DAY_MS);
  let created = 0;
  let skipped = 0;
  let checked = 0;

  for (const check of CHECKS) {
    const overdueRequests = await prisma.request.findMany({
      where: { status: check.status as never, updatedAt: { lte: cutoff } },
      select: { id: true, requestNumber: true, createdBy: true, updatedAt: true },
    });

    for (const request of overdueRequests) {
      checked += 1;

      if (!request.createdBy) {
        // Sin usuario "dueño" de la solicitud, no hay a quién notificar en un contexto de cron
        // (no existe un usuario "actor" como en una acción manual).
        skipped += 1;
        continue;
      }

      // Deduplicación: si ya existe una notificación de este tipo creada después de que la
      // solicitud entró a este estado, no se repite todos los días mientras siga atascada.
      const alreadyNotified = await prisma.notification.findFirst({
        where: {
          relatedEntityId: request.id,
          relatedEntityType: check.type,
          createdAt: { gte: request.updatedAt },
        },
      });

      if (alreadyNotified) {
        skipped += 1;
        continue;
      }

      await prisma.notification.create({
        data: {
          userId: request.createdBy,
          title: check.title,
          message: check.message(request.requestNumber),
          type: "WARNING",
          relatedEntityId: request.id,
          relatedEntityType: check.type,
        },
      });

      await createActivityLog({
        action: "SYNC_API",
        entityType: "Request",
        entityId: request.id,
        entityLabel: request.requestNumber,
        description: `Notificación automática: ${check.title}`,
      });

      created += 1;
    }
  }

  return { created, skipped, checked };
}
