import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { sendTemplateEmail } from "../services/email.service";
import { generateNumber } from "../services/numbering.service";
import { calculateTotals, normalizeItems } from "../services/quotation.calc";
import { VALID_TRANSITIONS } from "../validators/quotations.validator";
import { buildQuotationHtml } from "../services/pdf.service";

export async function listQuotations(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const statusRaw = req.query.status as string | undefined;
  const status = statusRaw ? statusRaw.toUpperCase() : undefined;

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(req.query.clientId ? { clientId: req.query.clientId as string } : {}),
    ...(req.query.requestId ? { requestId: req.query.requestId as string } : {}),
    ...(req.query.search ? { quotationNumber: { contains: req.query.search as string, mode: "insensitive" as const } } : {})
  };

  const [data, total] = await Promise.all([
    prisma.quotation.findMany({ where, include: { client: true, request: true }, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.quotation.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getQuotation(req: Request, res: Response): Promise<void> {
  const item = await prisma.quotation.findUnique({ where: { id: String(req.params.id) }, include: { request: true, client: true } });
  if (!item) throw new ApiError("Cotización no encontrada", 404, "QUOTATION_NOT_FOUND");
  sendItem(res, item);
}

export async function createQuotation(req: Request, res: Response): Promise<void> {
  const data = req.body;
  const config = await prisma.systemConfig.findFirst();
  const quotationNumber = await generateNumber("Quotation", config?.quotationNumberPrefix ?? "COTIZ");

  // Recalculo seguro en servidor
  const normalizedItems = normalizeItems(data.items);
  const totals = calculateTotals(normalizedItems, data.taxPercentage, data.discount);

  const item = await prisma.quotation.create({
    data: { 
      ...data, 
      ...totals,
      status: "BORRADOR",
      items: normalizedItems as any,
      quotationNumber, 
      createdBy: req.user!.id 
    }
  });

  // Sincronización automática: Si la solicitud estaba en Recepcionada, pasa a Cotizada
  const parentRequest = await prisma.request.findUnique({ where: { id: data.requestId } });
  if (parentRequest?.status === "RECEPCIONADA") {
    await prisma.request.update({ where: { id: data.requestId }, data: { status: "COTIZADA" } });
  }

  await createActivityLog({ action: "CREATE", entityType: "Quotation", entityId: item.id, entityLabel: item.quotationNumber, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateQuotation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const existing = await prisma.quotation.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Cotización no encontrada", 404);
  if (!["BORRADOR", "RECHAZADA"].includes(existing.status)) throw new ApiError("Solo se pueden editar cotizaciones en Borrador o Rechazadas", 409);

  const payload = { ...req.body };
  delete payload.status; // Protegemos el estado para que solo cambie por el endpoint dedicado

  if (payload.items || payload.taxPercentage !== undefined || payload.discount !== undefined) {
    const items = payload.items ? normalizeItems(payload.items) : (existing.items as any[]);
    const tax = payload.taxPercentage ?? existing.taxPercentage;
    const discount = payload.discount ?? existing.discount;
    const totals = calculateTotals(items, tax, discount);
    Object.assign(payload, { items, ...totals });
  }

  const item = await prisma.quotation.update({ where: { id }, data: payload });
  await createActivityLog({ action: "UPDATE", entityType: "Quotation", entityId: item.id, entityLabel: item.quotationNumber, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function changeQuotationStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const newStatus = req.body.status.toUpperCase();
  const notes = req.body.notes;

  const existing = await prisma.quotation.findUnique({ where: { id }, include: { client: true } });
  if (!existing) throw new ApiError("Cotización no encontrada", 404);

  const currentStatus = existing.status;
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) throw new ApiError(`Transición inválida de ${currentStatus} a ${newStatus}`, 409);

  // Sincronización automática
  if (newStatus === "ACEPTADA" && existing.requestId) {
    await prisma.request.update({ where: { id: existing.requestId }, data: { status: "CONFIRMADA" } });
  }

  const updated = await prisma.quotation.update({ where: { id }, data: { status: newStatus as any } });

  await createActivityLog({ action: "UPDATE", entityType: "Quotation", entityId: id, entityLabel: existing.quotationNumber, description: `Estado: ${currentStatus} -> ${newStatus}. ${notes || ""}`, performedBy: req.user!.id });
  sendItem(res, updated);
}

export async function previewQuotation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const quotation = await prisma.quotation.findUnique({ where: { id }, include: { client: true } });
  if (!quotation) throw new ApiError("Cotización no encontrada", 404);

  const html = buildQuotationHtml(quotation);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

export async function deleteQuotation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const existing = await prisma.quotation.findUnique({ where: { id } });
  if (existing && !["BORRADOR", "RECHAZADA"].includes(existing.status)) {
    throw new ApiError("No se puede eliminar una cotización que ya fue enviada o aceptada", 409);
  }

  const item = await prisma.quotation.delete({ where: { id } });
  await createActivityLog({ action: "DELETE", entityType: "Quotation", entityId: item.id, entityLabel: item.quotationNumber, performedBy: req.user?.id });
  sendItem(res, { ok: true, message: "Eliminada correctamente" });
}