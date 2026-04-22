import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { sendTemplateEmail } from "../services/email.service";
import { generateNumber } from "../services/numbering.service";

export async function listPayments(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const where = {
    ...(req.query.status ? { status: req.query.status as never } : {}),
    ...(req.query.clientId ? { clientId: req.query.clientId as string } : {}),
    ...(req.query.requestId ? { requestId: req.query.requestId as string } : {})
  };
  const [data, total] = await Promise.all([
    prisma.payment.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.payment.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getPayment(req: Request, res: Response): Promise<void> {
  const item = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!item) throw new ApiError("Pago no encontrado", 404, "PAYMENT_NOT_FOUND");
  sendItem(res, item);
}

export async function createPayment(req: Request, res: Response): Promise<void> {
  const config = await prisma.systemConfig.findFirst();
  const paymentNumber = await generateNumber("Payment", config?.paymentNumberPrefix ?? "PAG");
  const item = await prisma.payment.create({
    data: { ...(req.body as object), paymentNumber, createdBy: req.user?.id }
  });
  await createActivityLog({ action: "CREATE", entityType: "Payment", entityId: item.id, entityLabel: item.paymentNumber, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updatePayment(req: Request, res: Response): Promise<void> {
  const item = await prisma.payment.update({
    where: { id: req.params.id },
    data: req.body as object,
    include: { client: true }
  });
  if (item.status === "COMPLETADO" && item.client.email) {
    await sendTemplateEmail({
      type: "PAYMENT_CONFIRMED",
      to: item.client.email,
      fallbackSubject: `Pago ${item.paymentNumber} confirmado`,
      fallbackHtml: `<p>Tu pago ${item.paymentNumber} fue confirmado.</p>`
    });
  }
  await createActivityLog({ action: "UPDATE", entityType: "Payment", entityId: item.id, entityLabel: item.paymentNumber, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function deletePayment(req: Request, res: Response): Promise<void> {
  const item = await prisma.payment.delete({ where: { id: req.params.id } });
  await createActivityLog({ action: "DELETE", entityType: "Payment", entityId: item.id, entityLabel: item.paymentNumber, performedBy: req.user?.id });
  sendItem(res, { ok: true });
}
