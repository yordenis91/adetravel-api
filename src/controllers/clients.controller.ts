import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";

export async function listClients(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const search = req.query.search as string | undefined;
  const isActiveRaw = req.query.isActive as string | undefined;
  const isActive = isActiveRaw === undefined ? undefined : isActiveRaw === "true";

  const where = {
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } }
          ]
        }
      : {}),
    ...(isActive === undefined ? {} : { isActive })
  };

  const [data, total] = await Promise.all([
    prisma.client.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.client.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getClient(req: Request, res: Response): Promise<void> {
  const clientId = String(String(req.params.id));
  const item = await prisma.client.findUnique({ where: { id: clientId } });
  if (!item) throw new ApiError("Cliente no encontrado", 404, "CLIENT_NOT_FOUND");
  sendItem(res, item);
}

export async function createClient(req: Request, res: Response): Promise<void> {
  const item = await prisma.client.create({
    data: { ...(req.body as any), createdBy: req.user!.id }
  });
  await createActivityLog({ action: "CREATE", entityType: "Client", entityId: item.id, entityLabel: `${item.firstName} ${item.lastName}`, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateClient(req: Request, res: Response): Promise<void> {
  const clientId = String(String(req.params.id));
  const item = await prisma.client.update({ where: { id: clientId }, data: req.body as any });
  await createActivityLog({ action: "UPDATE", entityType: "Client", entityId: item.id, entityLabel: `${item.firstName} ${item.lastName}`, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function deleteClient(req: Request, res: Response): Promise<void> {
  const clientId = String(String(req.params.id));
  const item = await prisma.client.update({ where: { id: clientId }, data: { isActive: false } });
  await createActivityLog({ action: "DELETE", entityType: "Client", entityId: item.id, entityLabel: `${item.firstName} ${item.lastName}`, performedBy: req.user?.id });
  sendItem(res, { ok: true });
}
