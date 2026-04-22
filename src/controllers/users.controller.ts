import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";

export async function listUsers(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const search = req.query.search as string | undefined;

  const where = search
    ? {
        OR: [
          { fullName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } }
        ]
      }
    : {};

  const [data, total] = await Promise.all([
    prisma.user.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.user.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new ApiError("Usuario no encontrado", 404, "USER_NOT_FOUND");
  sendItem(res, user);
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: req.body as { role?: "ADMINISTRADOR" | "USUARIO"; agencyRole?: string | null; isActive?: boolean }
  });
  await createActivityLog({
    action: "UPDATE",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.email,
    performedBy: req.user?.id
  });
  sendItem(res, user);
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.delete({ where: { id: req.params.id } });
  await createActivityLog({
    action: "DELETE",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.email,
    performedBy: req.user?.id
  });
  sendItem(res, { ok: true });
}
