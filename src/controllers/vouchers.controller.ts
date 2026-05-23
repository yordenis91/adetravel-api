import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { sendTemplateEmail } from "../services/email.service";
import { generateNumber } from "../services/numbering.service";
import { VALID_TRANSITIONS } from "../validators/vouchers.validator";

export async function listVouchers(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const statusRaw = req.query.status as string | undefined;
  const status = statusRaw ? statusRaw.toUpperCase() : undefined;

  const where: any = {
    ...(status ? { status } : {}),
    ...(req.query.clientId ? { clientId: req.query.clientId as string } : {}),
    ...(req.query.requestId ? { requestId: req.query.requestId as string } : {}),
    ...(req.query.serviceType ? { serviceType: req.query.serviceType as string } : {})
  };

  if (req.query.search) {
    const search = req.query.search as string;
    where.OR = [
      { voucherNumber: { contains: search, mode: "insensitive" } },
      { serviceName: { contains: search, mode: "insensitive" } },
      { destination: { contains: search, mode: "insensitive" } },
      { confirmationCode: { contains: search, mode: "insensitive" } },
      { client: { firstName: { contains: search, mode: "insensitive" } } },
      { client: { lastName: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.voucher.findMany({ 
      where, skip, take: limit, 
      orderBy: { createdAt: "desc" },
      include: { 
        client: { select: { firstName: true, lastName: true, email: true } },
        request: { select: { requestNumber: true, destinationCity: true } },
        provider: { select: { name: true, fantasyName: true } }
      }
    }),
    prisma.voucher.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getVoucherStats(req: Request, res: Response): Promise<void> {
  const [total, borradores, emitidos, cancelados] = await Promise.all([
    prisma.voucher.count(),
    prisma.voucher.count({ where: { status: "BORRADOR" } }),
    prisma.voucher.count({ where: { status: "EMITIDO" } }),
    prisma.voucher.count({ where: { status: "CANCELADO" } }),
  ]);

  sendItem(res, { total, borradores, emitidos, cancelados });
}

export async function getVoucher(req: Request, res: Response): Promise<void> {
  const item = await prisma.voucher.findUnique({
    where: { id: String(req.params.id) },
    include: { client: true, provider: true, request: true }
  });
  if (!item) throw new ApiError("Voucher no encontrado", 404, "VOUCHER_NOT_FOUND");
  sendItem(res, item);
}

export async function createVoucher(req: Request, res: Response): Promise<void> {
  const data = req.body;

  // 1. Validar solicitud y extraer cliente y destino
  const request = await prisma.request.findUnique({ where: { id: data.requestId } });
  if (!request) throw new ApiError("La solicitud indicada no existe", 404);

  // 2. Validar proveedor (si se envía)
  if (data.providerId) {
    const provider = await prisma.provider.findUnique({ where: { id: data.providerId } });
    if (!provider) throw new ApiError("El proveedor indicado no existe", 404);
  }

  const config = await prisma.systemConfig.findFirst();
  const voucherNumber = await generateNumber("Voucher", config?.voucherNumberPrefix ?? "VCH");
  
  const destination = data.destination || request.destinationCity || request.destinationCountry || "";

  const item = await prisma.voucher.create({
    data: { 
      ...data, 
      clientId: request.clientId,
      destination,
      status: "BORRADOR", 
      voucherNumber, 
      createdBy: req.user!.id 
    },
    include: { client: true }
  });

  await createActivityLog({ action: "CREATE", entityType: "Voucher", entityId: item.id, entityLabel: item.voucherNumber, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateVoucher(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const existing = await prisma.voucher.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Voucher no encontrado", 404);
  if (existing.status !== "BORRADOR") throw new ApiError("Solo se pueden editar vouchers en estado Borrador", 409);

  const payload = { ...req.body };
  delete payload.status; // Protegemos el estado

  const item = await prisma.voucher.update({
    where: { id },
    data: payload,
    include: { client: true }
  });

  await createActivityLog({ action: "UPDATE", entityType: "Voucher", entityId: item.id, entityLabel: item.voucherNumber, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function changeVoucherStatus(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const newStatus = req.body.status.toUpperCase();

  const existing = await prisma.voucher.findUnique({ where: { id }, include: { client: true, provider: true } });
  if (!existing) throw new ApiError("Voucher no encontrado", 404);

  const currentStatus = existing.status.toUpperCase();
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new ApiError(`Transición inválida de ${currentStatus} a ${newStatus}`, 409);
  }

  // Regla Buildy: Validar que tenga datos completos para emitir
  if (newStatus === "EMITIDO") {
    if (!existing.serviceName || !existing.checkIn || !existing.checkOut || !existing.destination || !existing.providerId) {
      throw new ApiError("El voucher no tiene todos los datos requeridos (Servicio, Fechas, Destino y Operador) para ser emitido.", 400);
    }
  }

  const updated = await prisma.voucher.update({
    where: { id },
    data: { status: newStatus as any },
    include: { client: true, request: true, provider: true }
  });

  // Envío de email si se emite
  if (newStatus === "EMITIDO" && updated.client.email) {
    await sendTemplateEmail({
      type: "VOUCHER_ISSUED",
      to: updated.client.email,
      fallbackSubject: `Voucher de Servicio Confirmado: ${updated.voucherNumber}`,
      fallbackHtml: `<p>Estimado/a ${updated.client.firstName}, su servicio <strong>${updated.serviceName}</strong> ha sido confirmado con el código <strong>${updated.confirmationCode || 'Pendiente'}</strong>.</p>`
    }).catch(e => console.error("Error enviando email de voucher:", e));
  }

  await createActivityLog({ action: "UPDATE", entityType: "Voucher", entityId: id, entityLabel: existing.voucherNumber, description: `Estado cambiado de ${currentStatus} a ${newStatus}`, performedBy: req.user!.id });
  sendItem(res, updated);
}

export async function deleteVoucher(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const existing = await prisma.voucher.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Voucher no encontrado", 404);
  if (existing.status === "EMITIDO") throw new ApiError("No se puede eliminar un voucher que ya fue emitido", 409);

  const item = await prisma.voucher.delete({ where: { id } });
  await createActivityLog({ action: "DELETE", entityType: "Voucher", entityId: item.id, entityLabel: item.voucherNumber, performedBy: req.user?.id });
  sendItem(res, { ok: true, message: "Voucher eliminado correctamente" });
}