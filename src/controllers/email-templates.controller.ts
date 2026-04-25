import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";

export async function listEmailTemplates(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const isActiveRaw = req.query.isActive as string | undefined;
  const where = {
    ...(req.query.type ? { type: req.query.type as string } : {}),
    ...(isActiveRaw === undefined ? {} : { isActive: isActiveRaw === "true" })
  };
  const [data, total] = await Promise.all([
    prisma.emailTemplate.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.emailTemplate.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getEmailTemplate(req: Request, res: Response): Promise<void> {
  const item = await prisma.emailTemplate.findUnique({ where: { id: String(req.params.id) } });
  if (!item) throw new ApiError("Plantilla no encontrada", 404, "EMAIL_TEMPLATE_NOT_FOUND");
  sendItem(res, item);
}

export async function createEmailTemplate(req: Request, res: Response): Promise<void> {
  const item = await prisma.emailTemplate.create({
    data: { ...(req.body as any), createdBy: req.user!.id }
  });
  await createActivityLog({ action: "CREATE", entityType: "EmailTemplate", entityId: item.id, entityLabel: item.name, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateEmailTemplate(req: Request, res: Response): Promise<void> {
  const item = await prisma.emailTemplate.update({ where: { id: String(req.params.id) }, data: req.body as any });
  await createActivityLog({ action: "UPDATE", entityType: "EmailTemplate", entityId: item.id, entityLabel: item.name, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function deleteEmailTemplate(req: Request, res: Response): Promise<void> {
  const item = await prisma.emailTemplate.delete({ where: { id: String(req.params.id) } });
  await createActivityLog({ action: "DELETE", entityType: "EmailTemplate", entityId: item.id, entityLabel: item.name, performedBy: req.user?.id });
  sendItem(res, { ok: true });
}
