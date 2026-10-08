import { prisma } from "../lib/prisma";
import { logger } from "../utils/logger";

interface ActivityLogInput {
  action: "CREATE" | "UPDATE" | "DELETE" | "SYNC_API";
  entityType: string;
  entityId: string;
  entityLabel?: string;
  description?: string;
  performedBy?: string;
  metadata?: Record<string, unknown>;
}

export async function createActivityLog(input: ActivityLogInput): Promise<void> {
 try {
  await prisma.activityLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel,
      description: input.description,
      performedBy: input.performedBy,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined
    }
  });
} catch (error) {
    // 🔥 Falla silenciosa: El logger nunca debe revertir la operación principal
    logger.error({ err: error, action: input.action, entityId: input.entityId }, "[ActivityLogger] Error registrando actividad");
  }
}