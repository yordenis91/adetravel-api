import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { createActivityLog } from "../services/activity-log.service";

// Listar mis tareas
export async function listTasks(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { status } = req.query as { status?: string };
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const where: any = { userId };
  if (status) where.status = status;

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { dueDate: "asc" },
      skip,
      take: limit
    }),
    prisma.task.count({ where })
  ]);

  sendList(res, tasks, total, page, limit);
}

// Crear tarea
export async function createTask(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const data = req.body;

  const task = await prisma.task.create({
    data: { ...data, userId }
  });

  // Si la tarea tiene una prioridad ALTA, la registramos en la bitácora
  if (task.priority === "ALTA") {
    await createActivityLog({
      action: "CREATE", entityType: "Task", entityId: task.id,
      entityLabel: task.title, description: "Nueva tarea de prioridad ALTA creada",
      performedBy: userId
    });
  }

  sendItem(res, task, 201);
}

// Actualizar tarea (o marcar completada)
export async function updateTask(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = req.user!.id;
  const data = req.body;

  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError("Tarea no encontrada", 404);

  const updated = await prisma.task.update({ where: { id }, data });

  // Bitácora solo si cambió de estado a Completada
  if (existing.status !== "COMPLETADA" && updated.status === "COMPLETADA") {
    await createActivityLog({
      action: "UPDATE", entityType: "Task", entityId: updated.id,
      entityLabel: updated.title, description: "Tarea marcada como COMPLETADA",
      performedBy: userId
    });
  }

  sendItem(res, updated);
}

// Eliminar tarea
export async function deleteTask(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = req.user!.id;

  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError("Tarea no encontrada", 404);

  await prisma.task.delete({ where: { id } });
  sendItem(res, { ok: true, message: "Tarea eliminada" });
}