import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { sendTemplateEmail } from "../services/email.service";
import { generateNumber } from "../services/numbering.service";

export async function listQuotations(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const where = {
    ...(req.query.status ? { status: req.query.status as never } : {}),
    ...(req.query.clientId ? { clientId: req.query.clientId as string } : {}),
    ...(req.query.requestId ? { requestId: req.query.requestId as string } : {}),
    ...(req.query.search
      ? { quotationNumber: { contains: req.query.search as string, mode: "insensitive" as const } }
      : {})
  };
  const [data, total] = await Promise.all([
    prisma.quotation.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.quotation.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getQuotation(req: Request, res: Response): Promise<void> {
  const item = await prisma.quotation.findUnique({
    where: { id: String(req.params.id) },
    include: { request: true, client: true }
  });
  if (!item) throw new ApiError("Cotización no encontrada", 404, "QUOTATION_NOT_FOUND");
  sendItem(res, item);
}

export async function createQuotation(req: Request, res: Response): Promise<void> {
  const config = await prisma.systemConfig.findFirst();
  const quotationNumber = await generateNumber("Quotation", config?.quotationNumberPrefix ?? "COTIZ");
  const item = await prisma.quotation.create({
    data: { ...(req.body as any), quotationNumber, createdBy: req.user!.id }
  });
  await createActivityLog({ action: "CREATE", entityType: "Quotation", entityId: item.id, entityLabel: item.quotationNumber, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateQuotation(req: Request, res: Response): Promise<void> {
  const item = await prisma.quotation.update({ where: { id: String(req.params.id) }, data: req.body as any, include: { client: true } });
  if (item.status === "ENVIADA" && item.client.email) {
    await sendTemplateEmail({
      type: "QUOTATION_SENT",
      to: item.client.email,
      fallbackSubject: `Cotización ${item.quotationNumber}`,
      fallbackHtml: `<p>Tu cotización ${item.quotationNumber} fue enviada.</p>`
    });
  }
  await createActivityLog({ action: "UPDATE", entityType: "Quotation", entityId: item.id, entityLabel: item.quotationNumber, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function deleteQuotation(req: Request, res: Response): Promise<void> {
  const item = await prisma.quotation.delete({ where: { id: String(req.params.id) } });
  await createActivityLog({ action: "DELETE", entityType: "Quotation", entityId: item.id, entityLabel: item.quotationNumber, performedBy: req.user?.id });
  sendItem(res, { ok: true });
}
