import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { generateNumber } from "../services/numbering.service";
import { bubbleStatusToRequestIfComplete } from "../services/workflow.service";
import { VALID_TRANSITIONS } from "../validators/workflow-status";

export async function listServices(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const statusRaw = req.query.status as string | undefined;
  const status = statusRaw ? statusRaw.toUpperCase() : undefined;

  const where: any = {
    ...(status ? { status } : {}),
    ...(req.query.type ? { type: req.query.type as string } : {}),
    ...(req.query.requestId ? { requestId: req.query.requestId as string } : {}),
    ...(req.query.providerId ? { providerId: req.query.providerId as string } : {}),
    ...(req.query.clientId ? { clientId: req.query.clientId as string } : {}),
  };

  if (req.query.search) {
    const search = req.query.search as string;
    where.OR = [
      { serviceNumber: { contains: search, mode: "insensitive" } },
      { request: { requestNumber: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.service.findMany({
      where, skip, take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        request: { select: { requestNumber: true, isPackage: true } },
        provider: { select: { name: true, fantasyName: true } },
        client: { select: { firstName: true, lastName: true } },
      }
    }),
    prisma.service.count({ where })
  ]);
  sendList(res, data, total, page, limit);
}

export async function getServiceStats(req: Request, res: Response): Promise<void> {
  const [byStatus, byType, total] = await Promise.all([
    prisma.service.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.service.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.service.count()
  ]);
  const stats = byStatus.reduce((acc, item) => { acc[item.status] = item._count._all; return acc; }, {} as Record<string, number>);
  const byTypeStats = byType.reduce((acc, item) => { acc[item.type] = item._count._all; return acc; }, {} as Record<string, number>);
  sendItem(res, { stats, byType: byTypeStats, total });
}

export async function getService(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const item = await prisma.service.findUnique({
    where: { id },
    include: { request: true, provider: true, client: true, quotations: true, confirmations: true }
  });
  if (!item) throw new ApiError("Servicio no encontrado", 404, "SERVICE_NOT_FOUND");
  sendItem(res, item);
}

export async function createService(req: Request, res: Response): Promise<void> {
  const data = req.body;

  const request = await prisma.request.findUnique({ where: { id: data.requestId } });
  if (!request) throw new ApiError("La solicitud indicada no existe", 404);
  if (["VENDIDA", "CANCELADA"].includes(request.status)) {
    throw new ApiError(`No se pueden agregar servicios a una solicitud en estado "${request.status}"`, 409);
  }

  if (data.providerId) {
    const provider = await prisma.provider.findUnique({ where: { id: data.providerId } });
    if (!provider) throw new ApiError("El proveedor indicado no existe", 404);
  }

  const config = await prisma.systemConfig.findFirst();
  const serviceNumber = await generateNumber("Service", config?.serviceNumberPrefix ?? "SRV");

  const item = await prisma.service.create({
    data: { ...data, serviceNumber, createdBy: req.user!.id }
  });

  await createActivityLog({ action: "CREATE", entityType: "Service", entityId: item.id, entityLabel: item.serviceNumber, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateService(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const payload = { ...(req.body as any) };
  delete payload.status; // el estado se cambia solo vía /:id/status

  const item = await prisma.service.update({ where: { id }, data: payload });
  await createActivityLog({ action: "UPDATE", entityType: "Service", entityId: item.id, entityLabel: item.serviceNumber, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function changeServiceStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const newStatus = req.body.status.toUpperCase();
  const notes = req.body.notes;
  const cancellationReason = req.body.cancellationReason;

  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Servicio no encontrado", 404, "SERVICE_NOT_FOUND");

  const currentStatus = existing.status;
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new ApiError(`Transición inválida de ${currentStatus} a ${newStatus}`, 409, "INVALID_TRANSITION");
  }

  // Regla 4.4: para "Servicios asignados para cotizar" el servicio debe tener proveedor asignado.
  if (newStatus === "SERVICIOS_ASIGNADOS_PARA_COTIZAR" && !existing.providerId) {
    throw new ApiError("Debe asignar un proveedor al servicio antes de cotizar", 409, "NO_PROVIDER_ASSIGNED");
  }

  const updateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === "CANCELADA") updateData.cancellationReason = cancellationReason;

  const updated = await prisma.service.update({ where: { id }, data: updateData as never });

  await bubbleStatusToRequestIfComplete(existing.requestId, newStatus as never);

  await createActivityLog({
    action: "UPDATE", entityType: "Service", entityId: id, entityLabel: existing.serviceNumber,
    description: `Cambio de estado: ${currentStatus} -> ${newStatus}. ${notes || cancellationReason || ""}`,
    performedBy: req.user!.id
  });

  sendItem(res, updated);
}

export async function deleteService(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Servicio no encontrado", 404);

  const [quotationsCount, confirmationsCount] = await Promise.all([
    prisma.quotation.count({ where: { serviceId: id } }),
    prisma.confirmation.count({ where: { serviceId: id } }),
  ]);
  if (quotationsCount > 0 || confirmationsCount > 0) {
    throw new ApiError("No se puede eliminar porque tiene cotizaciones o confirmaciones asociadas.", 409, "SERVICE_HAS_RELATIONS");
  }

  const item = await prisma.service.delete({ where: { id } });
  await createActivityLog({ action: "DELETE", entityType: "Service", entityId: id, entityLabel: item.serviceNumber, performedBy: req.user?.id });
  sendItem(res, { ok: true, message: "Servicio eliminado correctamente" });
}
