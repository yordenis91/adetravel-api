import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { generateNumber } from "../services/numbering.service";

export async function listRequests(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const status = req.query.status as string | undefined;
  const clientId = req.query.clientId as string | undefined;
  const search = req.query.search as string | undefined;

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(clientId ? { clientId } : {}),
    ...(search
      ? {
          OR: [
            { requestNumber: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const [data, total] = await Promise.all([
    prisma.request.findMany({ where, include: { client: true }, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.request.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getRequest(req: Request, res: Response): Promise<void> {
  const item = await prisma.request.findUnique({ where: { id: req.params.id }, include: { client: true } });
  if (!item) throw new ApiError("Solicitud no encontrada", 404, "REQUEST_NOT_FOUND");
  sendItem(res, item);
}

export async function getRequestQuotations(req: Request, res: Response): Promise<void> {
  const data = await prisma.quotation.findMany({ where: { requestId: req.params.id }, orderBy: { createdAt: "desc" } });
  sendList(res, data, data.length, 1, data.length || 1);
}

export async function getRequestPayments(req: Request, res: Response): Promise<void> {
  const data = await prisma.payment.findMany({ where: { requestId: req.params.id }, orderBy: { createdAt: "desc" } });
  sendList(res, data, data.length, 1, data.length || 1);
}

export async function getRequestVouchers(req: Request, res: Response): Promise<void> {
  const data = await prisma.voucher.findMany({ where: { requestId: req.params.id }, orderBy: { createdAt: "desc" } });
  sendList(res, data, data.length, 1, data.length || 1);
}

export async function createRequest(req: Request, res: Response): Promise<void> {
  const config = await prisma.systemConfig.findFirst();
  const prefix = config?.requestNumberPrefix ?? "ADET";
  const requestNumber = await generateNumber("Request", prefix);
  const item = await prisma.request.create({
    data: { ...(req.body as object), requestNumber, createdBy: req.user?.id }
  });
  await createActivityLog({ action: "CREATE", entityType: "Request", entityId: item.id, entityLabel: item.requestNumber, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateRequest(req: Request, res: Response): Promise<void> {
  const item = await prisma.request.update({ where: { id: req.params.id }, data: req.body as object });
  await createActivityLog({ action: "UPDATE", entityType: "Request", entityId: item.id, entityLabel: item.requestNumber, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function deleteRequest(req: Request, res: Response): Promise<void> {
  const item = await prisma.request.delete({ where: { id: req.params.id } });
  await createActivityLog({ action: "DELETE", entityType: "Request", entityId: item.id, entityLabel: item.requestNumber, performedBy: req.user?.id });
  sendItem(res, { ok: true });
}
