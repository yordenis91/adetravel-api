import { Request, Response } from "express";
import { AgencyRole, UserRole } from "@prisma/client";
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
  const userId = String(String(req.params.id));
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError("Usuario no encontrado", 404, "USER_NOT_FOUND");
  sendItem(res, user);
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const userId = String(String(req.params.id));
  const updateData = req.body as {
    role?: UserRole;
    agencyRole?: AgencyRole | null;
    isActive?: boolean;
  };

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData
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
  const userId = String(String(req.params.id));
  const user = await prisma.user.delete({ where: { id: userId } });
  await createActivityLog({
    action: "DELETE",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.email,
    performedBy: req.user?.id
  });
  sendItem(res, { ok: true });
}
