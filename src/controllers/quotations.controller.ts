import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { sendTemplateEmail } from "../services/email.service";
import { generateNumber } from "../services/numbering.service";
import { VALID_TRANSITIONS } from "../validators/quotations.validator";
import { generateQuotationPdfBuffer } from "../services/pdf.service";

export async function listQuotations(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const statusRaw = req.query.status as string | undefined;
  const status = statusRaw ? statusRaw.toUpperCase() : undefined;

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(req.query.clientId ? { clientId: req.query.clientId as string } : {}),
    ...(req.query.requestId ? { requestId: req.query.requestId as string } : {}),
    ...(req.query.search
      ? { quotationNumber: { contains: req.query.search as string, mode: "insensitive" as const } }
      : {})
  };
  
  const [data, total] = await Promise.all([
    prisma.quotation.findMany({ where, include: { client: true, request: true }, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.quotation.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getQuotation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const item = await prisma.quotation.findUnique({
    where: { id },
    include: { request: true, client: true }
  });
  if (!item) throw new ApiError("Cotización no encontrada", 404, "QUOTATION_NOT_FOUND");
  sendItem(res, item);
}

export async function createQuotation(req: Request, res: Response): Promise<void> {
  const config = await prisma.systemConfig.findFirst();
  const quotationNumber = await generateNumber("Quotation", config?.quotationNumberPrefix ?? "COTIZ");
  
  const payload = { ...(req.body as any) };
  if (payload.status) payload.status = payload.status.toUpperCase();

  const item = await prisma.quotation.create({
    data: { ...payload, quotationNumber, createdBy: req.user!.id }
  });
  await createActivityLog({ action: "CREATE", entityType: "Quotation", entityId: item.id, entityLabel: item.quotationNumber, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateQuotation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const payload = { ...(req.body as any) };
  
  // No permitimos cambiar el estado por esta vía, solo datos.
  delete payload.status; 

  const item = await prisma.quotation.update({ where: { id }, data: payload, include: { client: true } });
  await createActivityLog({ action: "UPDATE", entityType: "Quotation", entityId: item.id, entityLabel: item.quotationNumber, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function changeQuotationStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const newStatus = req.body.status.toUpperCase();
  const notes = req.body.notes;

  const existing = await prisma.quotation.findUnique({ where: { id }, include: { client: true } });
  if (!existing) throw new ApiError("Cotización no encontrada", 404, "QUOTATION_NOT_FOUND");

  const currentStatus = existing.status;
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(newStatus)) {
    throw new ApiError(`Transición inválida de ${currentStatus} a ${newStatus}`, 409, "INVALID_TRANSITION");
  }

  const updated = await prisma.quotation.update({ where: { id }, data: { status: newStatus as any } });

  // Disparadores automáticos por estado
  if (newStatus === "ENVIADA" && existing.client.email) {
    await sendTemplateEmail({
      type: "QUOTATION_SENT",
      to: existing.client.email,
      fallbackSubject: `Cotización ${existing.quotationNumber} - ADE Travel`,
      fallbackHtml: `<p>Hola ${existing.client.firstName}, hemos enviado tu cotización <strong>${existing.quotationNumber}</strong>.</p>`
    }).catch(e => console.error("Error enviando email:", e));
  }

  // Lógica cruzada: Si se acepta la cotización, podríamos querer actualizar la Solicitud padre a "COTIZADA" o "CONFIRMADA"
  if (newStatus === "ACEPTADA" && existing.requestId) {
    await prisma.request.update({
      where: { id: existing.requestId },
      data: { status: "CONFIRMADA" } // O el estado que prefieras en tu flujo
    });
  }

  await createActivityLog({ 
    action: "UPDATE", entityType: "Quotation", entityId: id, entityLabel: existing.quotationNumber, 
    description: `Cambio de estado: ${currentStatus} -> ${newStatus}. ${notes || ""}`, 
    performedBy: req.user!.id 
  });

  sendItem(res, updated);
}

export async function downloadQuotationPdf(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  
  try {
    const pdfBuffer = await generateQuotationPdfBuffer(id);
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=cotizacion-${id}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    throw new ApiError("Error generando el documento PDF", 500);
  }
}

export async function deleteQuotation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  
  // Opcional: Proteger eliminación si ya fue aceptada
  const existing = await prisma.quotation.findUnique({ where: { id } });
  if (existing?.status === "ACEPTADA") {
    throw new ApiError("No se puede eliminar una cotización que ya fue aceptada.", 409);
  }

  const item = await prisma.quotation.delete({ where: { id } });
  await createActivityLog({ action: "DELETE", entityType: "Quotation", entityId: item.id, entityLabel: item.quotationNumber, performedBy: req.user?.id });
  sendItem(res, { ok: true, message: "Cotización eliminada" });
}