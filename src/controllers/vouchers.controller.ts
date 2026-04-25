import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { sendTemplateEmail } from "../services/email.service";
import { generateNumber } from "../services/numbering.service";

export async function listVouchers(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const where = {
    ...(req.query.status ? { status: req.query.status as never } : {}),
    ...(req.query.clientId ? { clientId: req.query.clientId as string } : {}),
    ...(req.query.requestId ? { requestId: req.query.requestId as string } : {})
  };
  const [data, total] = await Promise.all([
    prisma.voucher.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
    prisma.voucher.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getVoucher(req: Request, res: Response): Promise<void> {
  const item = await prisma.voucher.findUnique({
    where: { id: String(req.params.id) },
    include: { client: true, provider: true }
  });
  if (!item) throw new ApiError("Voucher no encontrado", 404, "VOUCHER_NOT_FOUND");
  sendItem(res, item);
}

export async function createVoucher(req: Request, res: Response): Promise<void> {
  const config = await prisma.systemConfig.findFirst();
  const voucherNumber = await generateNumber("Voucher", config?.voucherNumberPrefix ?? "VCH");
  const item = await prisma.voucher.create({
    data: { ...(req.body as any), voucherNumber, createdBy: req.user!.id }
  });
  await createActivityLog({ action: "CREATE", entityType: "Voucher", entityId: item.id, entityLabel: item.voucherNumber, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateVoucher(req: Request, res: Response): Promise<void> {
  const item = await prisma.voucher.update({
    where: { id: String(req.params.id) },
    data: req.body as any,
    include: { client: true }
  });
  if (item.status === "EMITIDO" && item.client.email) {
    await sendTemplateEmail({
      type: "VOUCHER_ISSUED",
      to: item.client.email,
      fallbackSubject: `Voucher ${item.voucherNumber} emitido`,
      fallbackHtml: `<p>Tu voucher ${item.voucherNumber} fue emitido.</p>`
    });
  }
  await createActivityLog({ action: "UPDATE", entityType: "Voucher", entityId: item.id, entityLabel: item.voucherNumber, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function deleteVoucher(req: Request, res: Response): Promise<void> {
  const item = await prisma.voucher.delete({ where: { id: String(req.params.id) } });
  await createActivityLog({ action: "DELETE", entityType: "Voucher", entityId: item.id, entityLabel: item.voucherNumber, performedBy: req.user?.id });
  sendItem(res, { ok: true });
}
