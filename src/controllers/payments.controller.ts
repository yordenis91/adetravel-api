import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { sendTemplateEmail } from "../services/email.service";
import { generateNumber } from "../services/numbering.service";
import { VALID_TRANSITIONS } from "../validators/payments.validator";

export async function listPayments(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const statusRaw = req.query.status as string | undefined;
  const status = statusRaw ? statusRaw.toUpperCase() : undefined;

  const where: any = {
    ...(status ? { status } : {}),
    ...(req.query.clientId ? { clientId: req.query.clientId as string } : {}),
    ...(req.query.requestId ? { requestId: req.query.requestId as string } : {})
  };

  if (req.query.search) {
    const search = req.query.search as string;
    where.OR = [
      { paymentNumber: { contains: search, mode: "insensitive" } },
      { reference: { contains: search, mode: "insensitive" } },
      { client: { firstName: { contains: search, mode: "insensitive" } } },
      { client: { lastName: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.payment.findMany({ 
      where, skip, take: limit, 
      orderBy: { createdAt: "desc" },
      include: { 
        client: { select: { firstName: true, lastName: true, email: true } },
        request: { select: { requestNumber: true } },
        quotation: { select: { quotationNumber: true } }
      }
    }),
    prisma.payment.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getPaymentStats(req: Request, res: Response): Promise<void> {
  const payments = await prisma.payment.findMany({ where: { status: "COMPLETADO" } });
  
  const totalCLP = payments.filter(p => p.currency === "CLP").reduce((sum, p) => sum + p.amount, 0);
  const totalUSD = payments.filter(p => p.currency === "USD").reduce((sum, p) => sum + p.amount, 0);

  const [pendientes, completados, cancelados] = await Promise.all([
    prisma.payment.count({ where: { status: "PENDIENTE" } }),
    prisma.payment.count({ where: { status: "COMPLETADO" } }),
    prisma.payment.count({ where: { status: "CANCELADO" } }),
  ]);

  sendItem(res, { totalCLP, totalUSD, pendientes, completados, cancelados });
}

export async function getPayment(req: Request, res: Response): Promise<void> {
  const item = await prisma.payment.findUnique({ 
    where: { id: String(req.params.id) },
    include: { client: true, request: true, quotation: true }
  });
  if (!item) throw new ApiError("Pago no encontrado", 404, "PAYMENT_NOT_FOUND");
  sendItem(res, item);
}

export async function createPayment(req: Request, res: Response): Promise<void> {
  const data = req.body;

  // 1. Validar existencia de la solicitud y extraer el cliente
  const request = await prisma.request.findUnique({ where: { id: data.requestId } });
  if (!request) throw new ApiError("La solicitud indicada no existe", 404);

  // 2. Validar que la cotización pertenezca a la solicitud
  if (data.quotationId) {
    const quotation = await prisma.quotation.findFirst({ where: { id: data.quotationId, requestId: data.requestId } });
    if (!quotation) throw new ApiError("La cotización no pertenece a la solicitud seleccionada", 400);
  }

  const config = await prisma.systemConfig.findFirst();
  const paymentNumber = await generateNumber("Payment", config?.paymentNumberPrefix ?? "PAG");
  
  const item = await prisma.payment.create({
    data: { 
      ...data, 
      clientId: request.clientId, // Asignación automática segura
      status: "PENDIENTE", 
      paymentNumber, 
      createdBy: req.user!.id 
    },
    include: { client: true }
  });

  await createActivityLog({ action: "CREATE", entityType: "Payment", entityId: item.id, entityLabel: item.paymentNumber, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updatePayment(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const existing = await prisma.payment.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Pago no encontrado", 404);
  if (existing.status !== "PENDIENTE") throw new ApiError("Solo se pueden editar pagos en estado Pendiente", 409);

  const payload = { ...req.body };
  delete payload.status; // Protegemos el estado

  const item = await prisma.payment.update({
    where: { id },
    data: payload,
    include: { client: true }
  });

  await createActivityLog({ action: "UPDATE", entityType: "Payment", entityId: item.id, entityLabel: item.paymentNumber, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function changePaymentStatus(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const newStatus = req.body.status.toUpperCase();

  const existing = await prisma.payment.findUnique({ where: { id }, include: { client: true } });
  if (!existing) throw new ApiError("Pago no encontrado", 404);

  const currentStatus = existing.status;
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new ApiError(`Transición inválida. No se puede pasar de ${currentStatus} a ${newStatus}`, 409);
  }

  const updated = await prisma.payment.update({
    where: { id },
    data: { status: newStatus as any },
    include: { client: true, request: true }
  });

  // Envío de email si se completa
  if (newStatus === "COMPLETADO" && updated.client.email) {
    await sendTemplateEmail({
      type: "PAYMENT_CONFIRMED",
      to: updated.client.email,
      fallbackSubject: `Pago ${updated.paymentNumber} confirmado`,
      fallbackHtml: `<p>Estimado/a ${updated.client.firstName}, su pago por ${updated.currency} ${updated.amount} ha sido procesado exitosamente.</p>`
    }).catch(e => console.error("Error enviando email de pago:", e));
  }

  // Bonus: Sincronizar estado de la solicitud a VENDIDA si se completa el pago
  if (newStatus === "COMPLETADO" && existing.requestId) {
    await prisma.request.update({ where: { id: existing.requestId }, data: { status: "VENDIDA" } });
  }

  await createActivityLog({ action: "UPDATE", entityType: "Payment", entityId: id, entityLabel: existing.paymentNumber, description: `Estado cambiado de ${currentStatus} a ${newStatus}`, performedBy: req.user!.id });
  sendItem(res, updated);
}

export async function deletePayment(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const existing = await prisma.payment.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Pago no encontrado", 404);
  if (existing.status === "COMPLETADO") throw new ApiError("No se puede eliminar un pago que ya fue completado", 409);

  const item = await prisma.payment.delete({ where: { id } });
  await createActivityLog({ action: "DELETE", entityType: "Payment", entityId: item.id, entityLabel: item.paymentNumber, performedBy: req.user?.id });
  sendItem(res, { ok: true, message: "Pago eliminado correctamente" });
}