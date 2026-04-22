import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";

export async function listProviders(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const search = req.query.search as string | undefined;
  const businessType = req.query.businessType as string | undefined;
  const isActiveRaw = req.query.isActive as string | undefined;
  const isActive = isActiveRaw === undefined ? undefined : isActiveRaw === "true";

  const where = {
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } }
          ]
        }
      : {}),
    ...(businessType ? { businessType } : {}),
    ...(isActive === undefined ? {} : { isActive })
  };

  const [data, total] = await Promise.all([
    prisma.provider.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.provider.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getProvider(req: Request, res: Response): Promise<void> {
  const item = await prisma.provider.findUnique({ where: { id: req.params.id } });
  if (!item) throw new ApiError("Proveedor no encontrado", 404, "PROVIDER_NOT_FOUND");
  sendItem(res, item);
}

export async function createProvider(req: Request, res: Response): Promise<void> {
  const item = await prisma.provider.create({
    data: { ...(req.body as object), createdBy: req.user?.id }
  });
  await createActivityLog({ action: "CREATE", entityType: "Provider", entityId: item.id, entityLabel: item.name, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateProvider(req: Request, res: Response): Promise<void> {
  const item = await prisma.provider.update({ where: { id: req.params.id }, data: req.body as object });
  await createActivityLog({ action: "UPDATE", entityType: "Provider", entityId: item.id, entityLabel: item.name, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function deleteProvider(req: Request, res: Response): Promise<void> {
  const item = await prisma.provider.delete({ where: { id: req.params.id } });
  await createActivityLog({ action: "DELETE", entityType: "Provider", entityId: item.id, entityLabel: item.name, performedBy: req.user?.id });
  sendItem(res, { ok: true });
}
