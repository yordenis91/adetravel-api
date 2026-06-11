import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";

// Listar notificaciones del usuario, con conteo de no leídas
export async function getNotifications(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } })
  ]);

  // Devolvemos lista + metadata incluyendo unreadCount
  sendItem(res, { items, total, page, limit, unreadCount });
}

// Marcar una notificación como leída (sólo si pertenece al usuario)
export async function markAsRead(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const userId = req.user!.id;

  const existing = await prisma.notification.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError("Notificación no encontrada", 404, "NOT_FOUND");

  if (existing.isRead) {
    sendItem(res, existing);
    return;
  }

  const updated = await prisma.notification.update({ where: { id }, data: { isRead: true } });
  sendItem(res, updated);
}

// Marcar todas las notificaciones del usuario como leídas
export async function markAllAsRead(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const result = await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  sendItem(res, { ok: true, updated: result.count });
}
