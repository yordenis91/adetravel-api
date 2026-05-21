import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { generateNumber } from "../services/numbering.service";
import { VALID_TRANSITIONS } from "../validators/requests.validator";

export async function listRequests(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const statusRaw = req.query.status as string | undefined;
  const status = statusRaw ? statusRaw.toUpperCase() : undefined;
  const clientId = req.query.clientId as string | undefined;
  const search = req.query.search as string | undefined;

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(clientId ? { clientId } : {}),
    ...(search ? {
      OR: [
        { requestNumber: { contains: search, mode: "insensitive" as const } },
        { destinationCity: { contains: search, mode: "insensitive" as const } },
        { destinationCountry: { contains: search, mode: "insensitive" as const } }
      ]
    } : {})
  };

  const [data, total] = await Promise.all([
    prisma.request.findMany({ where, include: { client: true }, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.request.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getRequest(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const item = await prisma.request.findUnique({ 
    where: { id }, 
    include: { client: true, quotations: true, payments: true, vouchers: true } 
  });
  if (!item) throw new ApiError("Solicitud no encontrada", 404, "REQUEST_NOT_FOUND");
  sendItem(res, item);
}

export async function getRequestQuotations(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const data = await prisma.quotation.findMany({ where: { requestId: id }, orderBy: { createdAt: "desc" } });
  sendList(res, data, data.length, 1, data.length || 1);
}

export async function getRequestPayments(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const data = await prisma.payment.findMany({ where: { requestId: id }, orderBy: { createdAt: "desc" } });
  sendList(res, data, data.length, 1, data.length || 1);
}

export async function getRequestVouchers(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const data = await prisma.voucher.findMany({ where: { requestId: id }, orderBy: { createdAt: "desc" } });
  sendList(res, data, data.length, 1, data.length || 1);
}

export async function createRequest(req: Request, res: Response): Promise<void> {
  const config = await prisma.systemConfig.findFirst();
  const prefix = config?.requestNumberPrefix ?? "ADET";
  const requestNumber = await generateNumber("Request", prefix);
  
  const payload = { ...(req.body as any) };
  if (payload.status) payload.status = payload.status.toUpperCase();

  const item = await prisma.request.create({
    data: { ...payload, requestNumber, createdBy: req.user!.id }
  });
  await createActivityLog({ action: "CREATE", entityType: "Request", entityId: item.id, entityLabel: item.requestNumber, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateRequest(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const payload = { ...(req.body as any) };
  if (payload.status) payload.status = payload.status.toUpperCase();

  const item = await prisma.request.update({ where: { id }, data: payload });
  await createActivityLog({ action: "UPDATE", entityType: "Request", entityId: item.id, entityLabel: item.requestNumber, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function changeRequestStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const newStatus = req.body.status.toUpperCase();
  const notes = req.body.notes;

  const existing = await prisma.request.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Solicitud no encontrada", 404, "REQUEST_NOT_FOUND");

  const currentStatus = existing.status;
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(newStatus)) {
    throw new ApiError(`Transición inválida de ${currentStatus} a ${newStatus}`, 409, "INVALID_TRANSITION");
  }

  if (newStatus === "CONFIRMADA") {
    const acceptedQuotation = await prisma.quotation.findFirst({ where: { requestId: id, status: "ACEPTADA" } });
    if (!acceptedQuotation) throw new ApiError("Para confirmar debe existir al menos una cotización Aceptada", 409, "NO_ACCEPTED_QUOTATION");
  }

  if (newStatus === "VENDIDA") {
    const completedPayment = await prisma.payment.findFirst({ where: { requestId: id, status: "COMPLETADO" } });
    if (!completedPayment) throw new ApiError("Para marcar como Vendida debe existir al menos un pago Completado", 409, "NO_COMPLETED_PAYMENT");
  }

  const updated = await prisma.request.update({ where: { id }, data: { status: newStatus as any } });
  await createActivityLog({ 
    action: "UPDATE", entityType: "Request", entityId: id, entityLabel: existing.requestNumber, 
    description: `Cambio de estado: ${currentStatus} -> ${newStatus}. ${notes || ""}`, 
    performedBy: req.user!.id 
  });

  sendItem(res, updated);
}

export async function duplicateRequest(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const original = await prisma.request.findUnique({ where: { id } });
  if (!original) throw new ApiError("Solicitud no encontrada", 404);

  const config = await prisma.systemConfig.findFirst();
  const prefix = config?.requestNumberPrefix ?? "ADET";
  const requestNumber = await generateNumber("Request", prefix);

  const { id: _id, requestNumber: _reqNum, status, createdAt, updatedAt, createdBy, ...restData } = original as any;

  const duplicate = await prisma.request.create({
    data: { ...restData, requestNumber, status: "RECEPCIONADA", createdBy: req.user!.id }
  });

  await createActivityLog({ action: "CREATE", entityType: "Request", entityId: duplicate.id, entityLabel: duplicate.requestNumber, description: "Duplicada de " + original.requestNumber, performedBy: req.user!.id });
  sendItem(res, duplicate, 201);
}

export async function deleteRequest(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const existing = await prisma.request.findUnique({ where: { id } });

  if (!existing) throw new ApiError("Solicitud no encontrada", 404);
  
  // Realizamos el conteo directo para evitar el error relacional _count de TypeScript
  const paymentsCount = await prisma.payment.count({ where: { requestId: id } });
  const vouchersCount = await prisma.voucher.count({ where: { requestId: id } });

  if (paymentsCount > 0 || vouchersCount > 0) {
    throw new ApiError("No se puede eliminar porque tiene pagos o vouchers asociados.", 409, "REQUEST_HAS_RELATIONS");
  }

  await prisma.quotation.deleteMany({ where: { requestId: id } }); 
  const item = await prisma.request.delete({ where: { id } });
  
  await createActivityLog({ action: "DELETE", entityType: "Request", entityId: id, entityLabel: item.requestNumber, performedBy: req.user?.id });
  sendItem(res, { ok: true, message: "Eliminada correctamente" });
}

export async function getRequestStats(req: Request, res: Response): Promise<void> {
  const [byStatus, total] = await Promise.all([
    prisma.request.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.request.count()
  ]);
  const stats = byStatus.reduce((acc, item) => { acc[item.status] = item._count._all; return acc; }, {} as Record<string, number>);
  sendItem(res, { stats, total });
}