import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { sendTemplateEmail } from "../services/email.service";
import { generateNumber } from "../services/numbering.service";
import { advanceWorkflowStatus, revertPaidRequest } from "../services/workflow.service";
import { isRequestFullyPaid } from "../services/payment-coverage";
import { resolveFullPaymentQuotation } from "../services/payment-rules";
import { env } from "../config/env";
import { VALID_TRANSITIONS } from "../validators/payments.validator";
import { logger } from "../utils/logger";

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
  const [totals, pendientes, completados, cancelados] = await Promise.all([
    prisma.payment.groupBy({ by: ["currency"], where: { status: "COMPLETADO" }, _sum: { amount: true } }),
    prisma.payment.count({ where: { status: "PENDIENTE" } }),
    prisma.payment.count({ where: { status: "COMPLETADO" } }),
    prisma.payment.count({ where: { status: "CANCELADO" } }),
  ]);

  const totalFor = (currency: string) => totals.find((t) => t.currency === currency)?._sum.amount ?? 0;

  sendItem(res, { totalCLP: totalFor("CLP"), totalUSD: totalFor("USD"), pendientes, completados, cancelados });
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
  if (request.status === "CANCELADA") {
    throw new ApiError("No se pueden registrar pagos en una solicitud cancelada", 409, "REQUEST_CANCELLED");
  }

  // 2. Cotización: sin pagos parciales (ALLOW_PARTIAL_PAYMENTS=false, decisión asumida) el pago es por
  // el total de una cotización aceptada; con pagos parciales basta que pertenezca a la solicitud
  // y esté en la misma moneda.
  const currency = data.currency ?? "CLP";
  if (!env.ALLOW_PARTIAL_PAYMENTS) {
    data.quotationId = await resolveFullPaymentQuotation({
      requestId: data.requestId,
      quotationId: data.quotationId,
      amount: data.amount,
      currency,
    });
  } else if (data.quotationId) {
    const quotation = await prisma.quotation.findFirst({ where: { id: data.quotationId, requestId: data.requestId } });
    if (!quotation) throw new ApiError("La cotización no pertenece a la solicitud seleccionada", 400);
    if (data.currency && data.currency !== quotation.currency) {
      throw new ApiError(
        `La moneda del pago (${data.currency}) no coincide con la de la cotización (${quotation.currency})`,
        400,
        "CURRENCY_MISMATCH"
      );
    }
  }

  const config = await prisma.systemConfig.findFirst();
  const paymentNumber = await generateNumber("Payment", config?.paymentNumberPrefix || "PAG");
  
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

  // Si cambia la solicitud o la cotización se revalida todo el conjunto y el cliente se vuelve a
  // derivar de la solicitud, igual que al crear (antes quedaba el clientId de la solicitud anterior).
  const targetRequestId = payload.requestId ?? existing.requestId;
  if (payload.requestId !== undefined && payload.requestId !== existing.requestId) {
    const request = await prisma.request.findUnique({ where: { id: payload.requestId } });
    if (!request) throw new ApiError("La solicitud indicada no existe", 404);
    if (request.status === "CANCELADA") {
      throw new ApiError("No se pueden registrar pagos en una solicitud cancelada", 409, "REQUEST_CANCELLED");
    }
    payload.clientId = request.clientId;
  }
  const targetQuotationId = payload.quotationId !== undefined ? payload.quotationId : existing.quotationId;
  const touchesAmounts = ["requestId", "quotationId", "amount", "currency"].some((k) => payload[k] !== undefined);
  if (!env.ALLOW_PARTIAL_PAYMENTS) {
    if (touchesAmounts) {
      payload.quotationId = await resolveFullPaymentQuotation({
        requestId: targetRequestId,
        quotationId: targetQuotationId,
        amount: payload.amount ?? existing.amount,
        currency: payload.currency ?? existing.currency,
        excludePaymentId: id,
      });
    }
  } else if (targetQuotationId && (payload.requestId !== undefined || payload.quotationId !== undefined || payload.currency !== undefined)) {
    const quotation = await prisma.quotation.findFirst({ where: { id: targetQuotationId, requestId: targetRequestId } });
    if (!quotation) throw new ApiError("La cotización no pertenece a la solicitud seleccionada", 400);
    const currency = payload.currency ?? existing.currency;
    if (currency !== quotation.currency) {
      throw new ApiError(
        `La moneda del pago (${currency}) no coincide con la de la cotización (${quotation.currency})`,
        400,
        "CURRENCY_MISMATCH"
      );
    }
  }

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
  const existing = await prisma.payment.findUnique({ where: { id }, include: { client: true, request: { select: { status: true } } } });
  if (!existing) throw new ApiError("Pago no encontrado", 404);

  const currentStatus = existing.status;
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new ApiError(`Transición inválida. No se puede pasar de ${currentStatus} a ${newStatus}`, 409);
  }

  // Reabrir un pago cancelado vuelve a ponerlo "vivo": se repiten las comprobaciones del alta. Sin
  // esto, cancelar A, registrar B y reabrir A dejaba dos pagos vivos para la misma cotización y
  // completar ambos cobraba dos veces.
  if (currentStatus === "CANCELADO" && newStatus === "PENDIENTE") {
    if (existing.request?.status === "CANCELADA") {
      throw new ApiError("No se pueden reabrir pagos de una solicitud cancelada", 409, "REQUEST_CANCELLED");
    }
    if (!env.ALLOW_PARTIAL_PAYMENTS && existing.quotationId) {
      const others = await prisma.payment.count({
        where: { quotationId: existing.quotationId, status: { in: ["PENDIENTE", "COMPLETADO"] }, id: { not: id } },
      });
      if (others > 0) {
        throw new ApiError("Esa cotización ya tiene otro pago registrado: no se puede reabrir este", 409, "PAYMENT_ALREADY_EXISTS");
      }
    }
  }

  // Determinar si el pago pasará a estado COMPLETADO (comparando previo y nuevo)
  const prevStatusUpper = (existing.status || "").toUpperCase();
  const newStatusIsCompleted = newStatus === "COMPLETADO" || newStatus === "COMPLETED";
  const prevWasCompleted = prevStatusUpper === "COMPLETADO" || prevStatusUpper === "COMPLETED";
  const justCompleted = !prevWasCompleted && newStatusIsCompleted;

  // Cambio atómico: solo aplica si el pago sigue en el estado leído, así dos peticiones
  // simultáneas no duplican el correo, la notificación ni el avance del flujo.
  const swapped = await prisma.payment.updateMany({ where: { id, status: currentStatus }, data: { status: newStatus as any } });
  if (swapped.count === 0) {
    throw new ApiError("El pago cambió de estado mientras se procesaba. Recarga e intenta de nuevo.", 409, "STATUS_CONFLICT");
  }
  const updated = await prisma.payment.findUniqueOrThrow({
    where: { id },
    include: { client: true, request: true }
  });

  // Envío de email si se completa (respeta el switch "Pago confirmado" de Configuración > Email)
  const config = await prisma.systemConfig.findFirst();
  const notifyPaymentCompleted = config?.notifyOnPaymentCompleted !== false;

  if (newStatus === "COMPLETADO" && notifyPaymentCompleted && updated.client.email) {
    await sendTemplateEmail({
      type: "PAYMENT_CONFIRMED",
      to: updated.client.email,
      fallbackSubject: `Pago ${updated.paymentNumber} confirmado`,
      fallbackHtml: `<p>Estimado/a ${updated.client.firstName}, su pago por ${updated.currency} ${updated.amount} ha sido procesado exitosamente.</p>`
    }).catch(e => logger.error({ err: e }, "Error enviando email de pago"));
  }

  // Crear notificación automática si el pago acaba de completarse
  if (justCompleted) {
    try {
      const userToNotify = updated.request?.createdBy || req.user?.id; // TODO: ajustar destinatario según la lógica de negocio
      if (userToNotify) {
        await prisma.notification.create({
          data: {
            userId: userToNotify,
            title: "Pago Recibido 🎉",
            message: `El pago ${updated.paymentNumber || updated.id} por ${updated.amount} ${updated.currency} ha sido completado.`,
            type: "PAYMENT_COMPLETED",
            isRead: false,
            relatedEntityType: "PAGO",
            relatedEntityId: updated.id
          }
        });
      } else {
        logger.warn("Notificación de pago completado: no se encontró userId para notificar");
      }
    } catch (e) {
      logger.error({ err: e }, "Error creando notificación de pago completado");
    }
  }

  // Sincronización con el flujo granular (regla 4.15 / sección de estados, pág. 11): el pago
  // del cliente es un paso intermedio, no el cierre de la venta. Pasa a PAGADO_POR_CLIENTE y
  // desciende automáticamente a todos los Servicios de la Solicitud. La Solicitud solo llega a
  // VENDIDA más adelante, tras pago al proveedor y entrega de voucher (ver requests.controller).
  // Solo cuando los pagos completados cubren lo aceptado: un anticipo (pago parcial) queda
  // registrado pero no da la solicitud por pagada, y sin cotización aceptada no avanza nada.
  if (newStatus === "COMPLETADO" && existing.requestId && (await isRequestFullyPaid(existing.requestId))) {
    await advanceWorkflowStatus(existing.requestId, null, "PAGADO_POR_CLIENTE");
  }

  // Reversa de un pago completado: si la solicitud ya no queda cubierta, deja de estar pagada.
  let reverted = false;
  if (currentStatus === "COMPLETADO" && newStatus === "CANCELADO" && existing.requestId && !(await isRequestFullyPaid(existing.requestId))) {
    reverted = await revertPaidRequest(existing.requestId);
  }

  await createActivityLog({ action: "UPDATE", entityType: "Payment", entityId: id, entityLabel: existing.paymentNumber, description: `Estado cambiado de ${currentStatus} a ${newStatus}${reverted ? ". La solicitud vuelve a ENVIADA_SOLICITUD_PAGO_CLIENTE" : ""}`, performedBy: req.user!.id });
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