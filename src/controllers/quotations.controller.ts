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

  // 1. Verificar que la Solicitud es válida para cotizar (Regla Buildy)
  const parentRequest = await prisma.request.findUnique({ where: { id: data.requestId } });
  if (!parentRequest) throw new ApiError("Solicitud no encontrada", 404);
  if (["VENDIDA", "CANCELADA"].includes(parentRequest.status)) {
    throw new ApiError(`No se pueden agregar cotizaciones a una solicitud en estado "${parentRequest.status}"`, 409);
  }

  const config = await prisma.systemConfig.findFirst();
  const quotationNumber = await generateNumber("Quotation", config?.quotationNumberPrefix ?? "COTIZ");

  // 2. Establecer validez y notas por defecto si no vienen (Regla Buildy)
  let validUntil = data.validUntil;
  if (!validUntil) {
    const d = new Date();
    d.setDate(d.getDate() + (config?.defaultQuotationValidityDays ?? 7));
    validUntil = d.toISOString().split("T")[0];
  }

  // 3. Recálculo seguro en el servidor
  const normalizedItems = normalizeItems(data.items);
  const totals = calculateTotals(normalizedItems, data.taxPercentage || 0, data.discount || 0);

  const item = await prisma.quotation.create({
    data: { 
      ...data, 
      ...totals,
      validUntil,
      status: "BORRADOR",
      items: normalizedItems as any,
      notes: data.notes ?? config?.defaultQuotationNotes ?? "",
      termsAndConditions: data.termsAndConditions ?? config?.defaultTermsAndConditions ?? "",
      quotationNumber, 
      createdBy: req.user!.id 
    }
  });

  // 4. Sincronización Automática con la Solicitud
  if (parentRequest.status === "RECEPCIONADA") {
    await prisma.request.update({ where: { id: data.requestId }, data: { status: "COTIZADA" } });
    await createActivityLog({ action: "UPDATE", entityType: "Request", entityId: parentRequest.id, entityLabel: parentRequest.requestNumber, description: "Cambiada a Cotizada automáticamente", performedBy: req.user?.id });
  }

  await createActivityLog({ action: "CREATE", entityType: "Quotation", entityId: item.id, entityLabel: item.quotationNumber, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateQuotation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const existing = await prisma.quotation.findUnique({ where: { id } });
  
  if (!existing) throw new ApiError("Cotización no encontrada", 404);
  
  // Regla Buildy: Solo Borradores o Rechazadas se pueden editar
  if (!["BORRADOR", "RECHAZADA"].includes(existing.status)) {
    throw new ApiError("Solo se pueden editar cotizaciones en Borrador o Rechazadas", 409);
  }

  const payload = { ...req.body };
  delete payload.status; // Protegemos el estado

  // Recalcular si modifican ítems, impuestos o descuentos
  if (payload.items || payload.taxPercentage !== undefined || payload.discount !== undefined) {
    const items = payload.items ? normalizeItems(payload.items) : (existing.items as any[]);
    const tax = payload.taxPercentage ?? existing.taxPercentage ?? 0;
    const discount = payload.discount ?? existing.discount ?? 0;
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

  // Regla Buildy: Si se envía, verificar que el cliente tiene email
  if (newStatus === "ENVIADA" && !existing.client.email) {
    throw new ApiError("El cliente no tiene un email registrado para enviar la cotización.", 409, "CLIENT_NO_EMAIL");
  }

  // Sincronización automática a Solicitud Confirmada
  if (newStatus === "ACEPTADA" && existing.requestId) {
    await prisma.request.update({ where: { id: existing.requestId }, data: { status: "CONFIRMADA" } });
  }

  const updated = await prisma.quotation.update({ where: { id }, data: { status: newStatus as any } });

  // Envío de correo según estado
  if (existing.client.email && ["ENVIADA", "ACEPTADA", "RECHAZADA"].includes(newStatus)) {
    const emailTypes: Record<string, string> = {
      "ENVIADA": "QUOTATION_SENT",
      "ACEPTADA": "QUOTATION_ACCEPTED",
      "RECHAZADA": "QUOTATION_REJECTED"
    };
    await sendTemplateEmail({
      type: emailTypes[newStatus],
      to: existing.client.email,
      fallbackSubject: `Cotización ${existing.quotationNumber} - ${newStatus.toLowerCase()}`,
      fallbackHtml: `<p>Tu cotización ${existing.quotationNumber} ha cambiado al estado: <strong>${newStatus}</strong></p>`
    }).catch(e => console.error("Error enviando email:", e));
  }

  await createActivityLog({ action: "UPDATE", entityType: "Quotation", entityId: id, entityLabel: existing.quotationNumber, description: `Estado: ${currentStatus} -> ${newStatus}. ${notes || ""}`, performedBy: req.user!.id });
  sendItem(res, updated);
}

export async function duplicateQuotation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const original = await prisma.quotation.findUnique({ where: { id } });
  if (!original) throw new ApiError("Cotización no encontrada", 404);

  const config = await prisma.systemConfig.findFirst();
  const quotationNumber = await generateNumber("Quotation", config?.quotationNumberPrefix ?? "COTIZ");

  const newValidUntil = new Date();
  newValidUntil.setDate(newValidUntil.getDate() + (config?.defaultQuotationValidityDays ?? 7));

  const { id: _id, quotationNumber: _oldNum, status, createdAt, updatedAt, createdBy, ...restData } = original as any;

  const duplicate = await prisma.quotation.create({
    data: {
      ...restData,
      quotationNumber,
      status: "BORRADOR",
      validUntil: newValidUntil.toISOString().split("T")[0],
      createdBy: req.user!.id
    }
  });

  await createActivityLog({ action: "CREATE", entityType: "Quotation", entityId: duplicate.id, entityLabel: duplicate.quotationNumber, description: `Duplicada a partir de ${original.quotationNumber}`, performedBy: req.user!.id });
  sendItem(res, duplicate, 201);
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