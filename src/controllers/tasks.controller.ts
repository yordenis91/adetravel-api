import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { createActivityLog } from "../services/activity-log.service";

// Listar tareas. Por defecto, las que tengo asignadas (sin importar quién las
// haya creado). Con scope=delegated, las que yo le asigné a otra persona
// (para no perderles el rastro una vez que salen de "Mis tareas").
export async function listTasks(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { status, relatedEntityId, relatedEntityType, scope } = req.query as {
    status?: string, relatedEntityId?: string, relatedEntityType?: string, scope?: string
  };
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const where: any = scope === "delegated"
    ? { createdBy: userId, NOT: { userId } }
    : { userId };
  if (status) where.status = status;
  if (relatedEntityId) where.relatedEntityId = relatedEntityId;
  if (relatedEntityType) where.relatedEntityType = relatedEntityType;

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { dueDate: "asc" },
      skip,
      take: limit
    }),
    prisma.task.count({ where })
  ]);

  const withNames = await attachUserNames(tasks);
  sendList(res, withNames, total, page, limit);
}

// Crear tarea, opcionalmente asignada a otro usuario del equipo (asigneeId).
export async function createTask(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { assigneeId, ...data } = req.body;

  const assignedTo = await resolveAssignee(assigneeId, userId);
  const isDelegated = assignedTo !== userId;

  const task = await prisma.task.create({
    data: { ...data, userId: assignedTo, createdBy: userId }
  });

  // 🔥 NOTIFICACIÓN: Tarea creada (o asignada, si es para otra persona)
  await prisma.notification.create({
    data: {
      userId: task.userId,
      title: "Nueva Tarea",
      message: isDelegated
        ? `${req.user!.fullName} te asignó la tarea: ${task.title}`
        : `Se ha registrado la tarea: ${task.title}`,
      type: "INFO",
      relatedEntityId: task.id,
      relatedEntityType: "TASK"
    }
  });

  // Si la tarea tiene una prioridad ALTA, o fue delegada a otra persona, la registramos en la bitácora
  if (task.priority === "ALTA" || isDelegated) {
    await createActivityLog({
      action: "CREATE", entityType: "Task", entityId: task.id,
      entityLabel: task.title,
      description: isDelegated ? "Tarea asignada a otro usuario" : "Nueva tarea de prioridad ALTA creada",
      performedBy: userId
    });
  }

  sendItem(res, task, 201);
}

// Actualizar tarea (marcar completada, editar detalles, o reasignarla con assigneeId).
// Puede hacerlo tanto el usuario asignado como quien la creó/asignó originalmente.
export async function updateTask(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = req.user!.id;
  const { assigneeId, ...data } = req.body;

  const existing = await prisma.task.findFirst({ where: { id, OR: [{ userId }, { createdBy: userId }] } });
  if (!existing) throw new ApiError("Tarea no encontrada", 404);

  if (assigneeId !== undefined) {
    data.userId = await resolveAssignee(assigneeId, existing.userId);
  }

  const updated = await prisma.task.update({ where: { id }, data });

  if (updated.userId !== existing.userId) {
    await prisma.notification.create({
      data: {
        userId: updated.userId,
        title: "Nueva Tarea",
        message: `${req.user!.fullName} te asignó la tarea: ${updated.title}`,
        type: "INFO",
        relatedEntityId: updated.id,
        relatedEntityType: "TASK"
      }
    });
    await createActivityLog({
      action: "UPDATE", entityType: "Task", entityId: updated.id,
      entityLabel: updated.title, description: "Tarea reasignada a otro usuario",
      performedBy: userId
    });
  }

  // Bitácora solo si cambió de estado a Completada
  if (existing.status !== "COMPLETADA" && updated.status === "COMPLETADA") {
    await createActivityLog({
      action: "UPDATE", entityType: "Task", entityId: updated.id,
      entityLabel: updated.title, description: "Tarea marcada como COMPLETADA",
      performedBy: userId
    });

    // 🔥 NOTIFICACIÓN: Tarea completada
    await prisma.notification.create({
      data: {
        userId: updated.userId,
        title: "Tarea Completada 🎉",
        message: `Excelente, has completado: ${updated.title}`,
        type: "SUCCESS",
        relatedEntityId: updated.id,
        relatedEntityType: "TASK"
      }
    });
  }

  sendItem(res, updated);
}

// Eliminar tarea (el usuario asignado o quien la creó/asignó)
export async function deleteTask(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = req.user!.id;

  const existing = await prisma.task.findFirst({ where: { id, OR: [{ userId }, { createdBy: userId }] } });
  if (!existing) throw new ApiError("Tarea no encontrada", 404);

  await prisma.task.delete({ where: { id } });
  sendItem(res, { ok: true, message: "Tarea eliminada" });
}

// Resuelve a quién queda asignada la tarea: si no se pide un assigneeId (o es
// el mismo usuario), se autoasigna a `fallbackUserId` (comportamiento previo).
// Si se pide otro usuario, valida que exista y esté activo antes de delegarle la tarea.
async function resolveAssignee(assigneeId: string | null | undefined, fallbackUserId: string): Promise<string> {
  if (!assigneeId || assigneeId === fallbackUserId) return fallbackUserId;

  const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, isActive: true } });
  if (!assignee) throw new ApiError("El usuario asignado no existe", 404, "ASSIGNEE_NOT_FOUND");
  if (!assignee.isActive) throw new ApiError("No se puede asignar una tarea a un usuario inactivo", 409, "ASSIGNEE_INACTIVE");

  return assignee.id;
}

// `Task.userId` (a quién está asignada) y `Task.createdBy` (quién la asignó)
// no son relaciones de Prisma (mismo patrón que `Request.createdBy`), así que
// resolvemos ambos nombres a mano con un solo query batched.
async function attachUserNames<T extends { userId: string; createdBy?: string | null }>(
  items: T[]
): Promise<(T & { createdByName: string | null; assigneeName: string | null })[]> {
  const ids = [...new Set(items.flatMap((item) => [item.userId, item.createdBy]).filter((id): id is string => !!id))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
    : [];
  const nameMap = new Map(users.map((u) => [u.id, u.fullName]));
  return items.map((item) => ({
    ...item,
    createdByName: item.createdBy ? nameMap.get(item.createdBy) ?? null : null,
    assigneeName: nameMap.get(item.userId) ?? null
  }));
}
