import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { sendTemplateEmail } from "../services/email.service";
import { generateNumber } from "../services/numbering.service";
import { calculateTotals, normalizeItems } from "../services/quotation.calc";
import { advanceWorkflowStatus } from "../services/workflow.service";
import { VALID_TRANSITIONS } from "../validators/quotations.validator";
import { buildQuotationHtml, generateQuotationPdfBuffer } from "../services/pdf.service";
import { getAgencyHeader } from "../services/agency.service";
import { logger } from "../utils/logger";
import { escapeHtml } from "../utils/html";
import { formatMoney } from "../utils/money";
import { isExpired } from "../utils/dates";
import { env } from "../config/env";

/** Cuerpo del correo cuando no hay plantilla en base: número, monto, vigencia y, si corresponde, el PDF adjunto. */
function buildQuotationEmailHtml(
  quotation: { quotationNumber: string; currency: string; total: number | null; validUntil: string | null },
  client: { firstName: string },
  status: string
): string {
  const number = escapeHtml(quotation.quotationNumber);
  const greeting = `<p>Estimado/a ${escapeHtml(client.firstName)},</p>`;
  if (status !== "ENVIADA") {
    return `${greeting}<p>Tu cotización ${number} ha cambiado al estado: <strong>${escapeHtml(status)}</strong>.</p>`;
  }
  const total = quotation.total != null ? `${quotation.currency} ${formatMoney(quotation.total, quotation.currency)}` : null;
  return [
    greeting,
    `<p>Te enviamos la cotización <strong>${number}</strong>${total ? ` por un total de <strong>${escapeHtml(total)}</strong>` : ""}.</p>`,
    quotation.validUntil ? `<p>Es válida hasta el ${escapeHtml(quotation.validUntil)}.</p>` : "",
    "<p>Encontrarás el detalle en el PDF adjunto. Cualquier duda, responde a este correo.</p>",
  ].join("");
}

/** PDF de la cotización como adjunto; si no se puede generar, el correo sale igual sin adjunto. */
async function buildQuotationAttachment(quotation: any, client: any) {
  try {
    const content = await generateQuotationPdfBuffer({ ...quotation, client });
    return [{ filename: `${quotation.quotationNumber}.pdf`, content, contentType: "application/pdf" }];
  } catch (e) {
    logger.error({ err: e, quotationId: quotation.id }, "No se pudo generar el PDF para adjuntar al correo");
    return undefined;
  }
}

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

  // 1a. La cotización es del cliente de la solicitud (igual que en Pagos): sin esto se podría
  // cotizar la solicitud de un cliente a nombre de otro y enviarle el correo equivocado.
  if (data.clientId !== parentRequest.clientId) {
    throw new ApiError("El cliente no corresponde al de la solicitud indicada", 400, "CLIENT_REQUEST_MISMATCH");
  }

  // 1b. Si se indica un Servicio, debe pertenecer a la misma Solicitud (regla de "Paquete": si
  // parentRequest.isPackage es true, no es necesario especificar el servicio, ver sección 4.6).
  if (data.serviceId) {
    const service = await prisma.service.findFirst({ where: { id: data.serviceId, requestId: data.requestId } });
    if (!service) throw new ApiError("El servicio no pertenece a la solicitud indicada", 400);
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
  const normalizedItems = normalizeItems(data.items, data.currency);
  const totals = calculateTotals(normalizedItems, data.taxPercentage || 0, data.discount || 0, data.currency);

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

  // 4. Sincronización automática: crear la cotización final representa la sección 4.7
  // ("Crear oferta final") del documento -> avanza el Servicio/Solicitud a COTIZADO_POR_ADETRAVEL
  // (si aún no había llegado ahí; nunca retrocede ni reactiva una entidad Cancelada).
  await advanceWorkflowStatus(data.requestId, data.serviceId ?? null, "COTIZADO_POR_ADETRAVEL");

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

  // La solicitud y el cliente de una cotización no cambian: para otra solicitud se crea (o duplica) una nueva.
  if (payload.requestId !== undefined && payload.requestId !== existing.requestId) {
    throw new ApiError("No se puede cambiar la solicitud de una cotización", 400, "QUOTATION_REQUEST_LOCKED");
  }
  if (payload.clientId !== undefined && payload.clientId !== existing.clientId) {
    throw new ApiError("No se puede cambiar el cliente de una cotización", 400, "QUOTATION_CLIENT_LOCKED");
  }
  if (payload.serviceId) {
    const service = await prisma.service.findFirst({ where: { id: payload.serviceId, requestId: existing.requestId } });
    if (!service) throw new ApiError("El servicio no pertenece a la solicitud de la cotización", 400);
  }

  // Recalcular si modifican ítems, impuestos, descuento o moneda (los decimales dependen de la moneda)
  if (payload.items || payload.taxPercentage !== undefined || payload.discount !== undefined || payload.currency !== undefined) {
    const currency = payload.currency ?? existing.currency;
    const items = normalizeItems(payload.items ?? (existing.items as any[]), currency);
    const tax = payload.taxPercentage ?? existing.taxPercentage ?? 0;
    const discount = payload.discount ?? existing.discount ?? 0;
    const totals = calculateTotals(items, tax, discount, currency);
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

  const existing = await prisma.quotation.findUnique({ where: { id }, include: { client: true, request: { select: { status: true } } } });
  if (!existing) throw new ApiError("Cotización no encontrada", 404);

  const currentStatus = existing.status;
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) throw new ApiError(`Transición inválida de ${currentStatus} a ${newStatus}`, 409);

  // Una solicitud cancelada no admite enviar ni aceptar cotizaciones: quedaría una cotización
  // aceptada que no se puede cobrar (los pagos se rechazan con REQUEST_CANCELLED). Rechazar sí.
  if (["ENVIADA", "ACEPTADA"].includes(newStatus) && existing.request?.status === "CANCELADA") {
    throw new ApiError("La solicitud está cancelada: no se puede enviar ni aceptar la cotización", 409, "REQUEST_CANCELLED");
  }

  // Regla Buildy: Si se envía, verificar que el cliente tiene email
  if (newStatus === "ENVIADA" && !existing.client.email) {
    throw new ApiError("El cliente no tiene un email registrado para enviar la cotización.", 409, "CLIENT_NO_EMAIL");
  }

  // Una cotización vencida no se envía ni se acepta: hay que renovar la vigencia (editándola en Borrador).
  // Decisión asumida (BLOCK_EXPIRED_QUOTATIONS=true), pendiente de confirmar: ver DECISIONES_PENDIENTES.md.
  if (env.BLOCK_EXPIRED_QUOTATIONS && ["ENVIADA", "ACEPTADA"].includes(newStatus) && isExpired(existing.validUntil)) {
    throw new ApiError(
      `La cotización venció el ${existing.validUntil}. Actualiza la fecha de validez antes de continuar.`,
      409,
      "QUOTATION_EXPIRED"
    );
  }

  // Cambio atómico: solo aplica si sigue en el estado leído. Dos peticiones simultáneas ya no
  // repiten la transición (ni el correo ni el avance de flujo).
  const swapped = await prisma.quotation.updateMany({ where: { id, status: currentStatus }, data: { status: newStatus as any } });
  if (swapped.count === 0) {
    throw new ApiError("La cotización cambió de estado mientras se procesaba. Recarga e intenta de nuevo.", 409, "STATUS_CONFLICT");
  }
  const updated = await prisma.quotation.findUniqueOrThrow({ where: { id } });

  // Sincronización automática con el flujo granular: 4.8 "Envío de Oferta al Cliente" ->
  // ENVIADO_AL_CLIENTE; 4.9 "Aceptación del cliente" -> ACEPTADA_POR_CLIENTE. La sección 4
  // describe ambas acciones como aplicables "al servicio o la solicitud", por lo que, igual que
  // en la creación de la cotización, respetan existing.serviceId cuando la cotización es de un
  // Servicio puntual (burbujeando a la Solicitud solo si TODOS sus servicios llegan al mismo
  // estado — ver BUBBLE_UP_STATUSES) y solo operan directo sobre la Solicitud cuando no hay
  // Servicio asociado (modo Paquete).
  if (newStatus === "ENVIADA") {
    await advanceWorkflowStatus(existing.requestId, existing.serviceId, "ENVIADO_AL_CLIENTE");
  }
  if (newStatus === "ACEPTADA") {
    await advanceWorkflowStatus(existing.requestId, existing.serviceId, "ACEPTADA_POR_CLIENTE");
  }

  // Envío de correo según estado (respeta el switch "Cotización enviada" de Configuración > Email)
  const config = await prisma.systemConfig.findFirst();
  const notifyQuotationSent = config?.notifyOnQuotationSent !== false;
  const shouldSendQuotationEmail = newStatus === "ENVIADA" ? notifyQuotationSent : true;

  if (existing.client.email && shouldSendQuotationEmail && ["ENVIADA", "ACEPTADA", "RECHAZADA"].includes(newStatus)) {
    const emailTypes: Record<string, string> = {
      "ENVIADA": "QUOTATION_SENT",
      "ACEPTADA": "QUOTATION_ACCEPTED",
      "RECHAZADA": "QUOTATION_REJECTED"
    };
    const attachments = newStatus === "ENVIADA" ? await buildQuotationAttachment(updated, existing.client) : undefined;
    await sendTemplateEmail({
      type: emailTypes[newStatus],
      to: existing.client.email,
      fallbackSubject: `Cotización ${existing.quotationNumber} - ${newStatus.toLowerCase()}`,
      fallbackHtml: buildQuotationEmailHtml(updated, existing.client, newStatus),
      attachments
    }).catch(e => logger.error({ err: e }, "Error enviando email de cotización"));
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

  const html = buildQuotationHtml(quotation, await getAgencyHeader());
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

export async function downloadQuotationPdf(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const quotation = await prisma.quotation.findUnique({ where: { id }, include: { client: true } });
  if (!quotation) throw new ApiError("Cotización no encontrada", 404);

  const buffer = await generateQuotationPdfBuffer(quotation);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${quotation.quotationNumber}.pdf"`);
  res.send(buffer);
}

export async function deleteQuotation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const existing = await prisma.quotation.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Cotización no encontrada", 404, "QUOTATION_NOT_FOUND");

  if (!["BORRADOR", "RECHAZADA"].includes(existing.status)) {
    throw new ApiError("No se puede eliminar una cotización que ya fue enviada o aceptada", 409);
  }

  const linkedPayments = await prisma.payment.count({ where: { quotationId: id } });
  if (linkedPayments > 0) {
    throw new ApiError("No se puede eliminar una cotización que tiene pagos asociados", 409, "QUOTATION_HAS_PAYMENTS");
  }

  const item = await prisma.quotation.delete({ where: { id } });
  await createActivityLog({ action: "DELETE", entityType: "Quotation", entityId: item.id, entityLabel: item.quotationNumber, performedBy: req.user?.id });
  sendItem(res, { ok: true, message: "Eliminada correctamente" });
}