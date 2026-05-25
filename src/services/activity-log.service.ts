import { prisma } from "../lib/prisma";

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
    console.error("[ActivityLogger] Error registrando actividad:", {
      action: input.action,
      entityId: input.entityId,
      error: (error as Error).message
    });
  }
}