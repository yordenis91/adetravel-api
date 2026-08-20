import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { generateNumber } from "../services/numbering.service";
import { advanceWorkflowStatus } from "../services/workflow.service";

export async function listConfirmations(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);

  const where: any = {
    ...(req.query.requestId ? { requestId: req.query.requestId as string } : {}),
    ...(req.query.serviceId ? { serviceId: req.query.serviceId as string } : {}),
    ...(req.query.providerId ? { providerId: req.query.providerId as string } : {}),
    ...(req.query.search ? { confirmationNumber: { contains: req.query.search as string, mode: "insensitive" as const } } : {})
  };

  const [data, total] = await Promise.all([
    prisma.confirmation.findMany({
      where, skip, take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        request: { select: { requestNumber: true, isPackage: true } },
        service: { select: { serviceNumber: true, type: true } },
        provider: { select: { name: true, fantasyName: true } },
      }
    }),
    prisma.confirmation.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getConfirmation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const item = await prisma.confirmation.findUnique({
    where: { id },
    include: { request: true, service: true, provider: true }
  });
  if (!item) throw new ApiError("Confirmación no encontrada", 404, "CONFIRMATION_NOT_FOUND");
  sendItem(res, item);
}

// Sección 4.12 del documento: registrar la confirmación del proveedor externo actualiza
// el precio del servicio y pasa el Servicio/Solicitud al estado CONFIRMADA_POR_PROVEEDOR.
export async function createConfirmation(req: Request, res: Response): Promise<void> {
  const data = req.body;

  const request = await prisma.request.findUnique({ where: { id: data.requestId } });
  if (!request) throw new ApiError("La solicitud indicada no existe", 404);
  if (["VENDIDA", "CANCELADA"].includes(request.status)) {
    throw new ApiError(`No se pueden registrar confirmaciones sobre una solicitud en estado "${request.status}"`, 409);
  }

  const provider = await prisma.provider.findUnique({ where: { id: data.providerId } });
  if (!provider) throw new ApiError("El proveedor indicado no existe", 404);

  let service = null;
  if (data.serviceId) {
    service = await prisma.service.findFirst({ where: { id: data.serviceId, requestId: data.requestId } });
    if (!service) throw new ApiError("El servicio no pertenece a la solicitud indicada", 400);
  }

  const config = await prisma.systemConfig.findFirst();
  const confirmationNumber = await generateNumber("Confirmation", config?.confirmationNumberPrefix ?? "CONF");

  const item = await prisma.confirmation.create({
    data: { ...data, confirmationNumber, createdBy: req.user!.id }
  });

  // Actualiza el precio del servicio (regla 4.12) y avanza el flujo a CONFIRMADA_POR_PROVEEDOR
  // (a nivel Servicio, burbujeando a la Solicitud si corresponde; o directo en la Solicitud
  // cuando es Paquete y no hay serviceId).
  if (service) {
    await prisma.service.update({ where: { id: service.id }, data: { price: data.price } });
  }
  await advanceWorkflowStatus(request.id, data.serviceId ?? null, "CONFIRMADA_POR_PROVEEDOR");

  await createActivityLog({ action: "CREATE", entityType: "Confirmation", entityId: item.id, entityLabel: item.confirmationNumber, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateConfirmation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const item = await prisma.confirmation.update({ where: { id }, data: req.body });
  await createActivityLog({ action: "UPDATE", entityType: "Confirmation", entityId: item.id, entityLabel: item.confirmationNumber, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function deleteConfirmation(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const existing = await prisma.confirmation.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Confirmación no encontrada", 404);

  const item = await prisma.confirmation.delete({ where: { id } });
  await createActivityLog({ action: "DELETE", entityType: "Confirmation", entityId: id, entityLabel: item.confirmationNumber, performedBy: req.user?.id });
  sendItem(res, { ok: true, message: "Confirmación eliminada correctamente" });
}
