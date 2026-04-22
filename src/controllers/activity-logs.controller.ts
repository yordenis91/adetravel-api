import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendList } from "../utils/response";
import { getPagination } from "../utils/pagination";

export async function listActivityLogs(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const where = {
    ...(req.query.entityType ? { entityType: req.query.entityType as string } : {}),
    ...(req.query.entityId ? { entityId: req.query.entityId as string } : {})
  };

  const [data, total] = await Promise.all([
    prisma.activityLog.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.activityLog.count({ where })
  ]);

  sendList(res, data, total, page, limit);
}
