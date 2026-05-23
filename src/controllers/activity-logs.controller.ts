import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { getPagination } from "../utils/pagination";
import { ApiError } from "../utils/api-error";

export async function listActivityLogs(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const { entityType, entityId, action, search, performedBy, dateFrom, dateTo } = req.query as any;

  const where: any = {};

  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (action) where.action = action;
  if (performedBy) where.performedBy = { contains: performedBy, mode: "insensitive" };

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
    if (dateTo) where.createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
  }

  if (search) {
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { entityLabel: { contains: search, mode: "insensitive" } },
      { action: { contains: search, mode: "insensitive" } },
    ];
  }

  // Ejecución secuencial para evitar advertencias de conexión pg
  const total = await prisma.activityLog.count({ where });
  const data = await prisma.activityLog.findMany({ 
    where, skip, take: limit, orderBy: { createdAt: "desc" } 
  });

  sendList(res, data, total, page, limit);
}

export async function getActivityLogStats(req: Request, res: Response): Promise<void> {
  const days = Number(req.query.days) || 30;
  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const total = await prisma.activityLog.count();
  const today = await prisma.activityLog.count({ where: { createdAt: { gte: todayStart } } });
  const recent = await prisma.activityLog.count({ where: { createdAt: { gte: periodStart } } });

  // Agrupado por tipo de entidad
  const byEntityRaw = await prisma.activityLog.groupBy({
    by: ["entityType"],
    _count: { id: true },
    where: { createdAt: { gte: periodStart } },
    orderBy: { _count: { id: "desc" } }
  });
  const byEntity = byEntityRaw.reduce((acc, curr) => ({ ...acc, [curr.entityType]: curr._count.id }), {});

  // Top acciones más comunes
  const topActionsRaw = await prisma.activityLog.groupBy({
    by: ["action"],
    _count: { id: true },
    where: { createdAt: { gte: periodStart } },
    orderBy: { _count: { id: "desc" } },
    take: 10
  });
  const topActions = topActionsRaw.map(a => ({ action: a.action, count: a._count.id }));

  sendItem(res, { total, today, recent, byEntity, topActions });
}

export async function purgeActivityLogs(req: Request, res: Response): Promise<void> {
  const days = Number(req.query.days) || 90;
  if (days < 30) throw new ApiError("Por seguridad, no se pueden purgar logs con menos de 30 días de antigüedad", 400);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const result = await prisma.activityLog.deleteMany({
    where: { createdAt: { lt: cutoff } }
  });

  sendItem(res, { 
    message: `Limpieza completada. Se eliminaron ${result.count} registros anteriores a ${days} días.`, 
    purged: result.count 
  });
}