import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { createActivityLog } from "../services/activity-log.service";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";

// ─────────────────────────────────────────────────────────────────────
//  LISTAR CLIENTES
// ─────────────────────────────────────────────────────────────────────
export async function listClients(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const { search = "", isActive, referralSource, sort = "-createdAt" } = req.query as Record<string, string>;

  const where: any = {};

  if (search.trim()) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { rut: { contains: search, mode: "insensitive" } },
      { passportNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  if (isActive !== undefined) {
    where.isActive = isActive === "true";
  }

  if (referralSource) {
    where.referralSource = referralSource;
  }

  const sortDesc = sort.startsWith("-");
  const sortField = sort.replace(/^-/, "");
  const ALLOWED_SORT_FIELDS = ["createdAt", "updatedAt", "firstName", "lastName", "email"];

  const orderBy = ALLOWED_SORT_FIELDS.includes(sortField)
    ? { [sortField]: sortDesc ? ("desc" as const) : ("asc" as const) }
    : { createdAt: "desc" as const };

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      // Usamos 'include' en lugar de 'select' para traer TODOS los campos del modelo 
      // (pasaporte, banco, restricciones) sin tener que escribirlos uno por uno.
      include: { 
        _count: { select: { requests: true } } 
      },
    }),
    prisma.client.count({ where }),
  ]);

  sendList(res, clients, total, page, limit);
}

// ─────────────────────────────────────────────────────────────────────
//  OBTENER UN CLIENTE
// ─────────────────────────────────────────────────────────────────────
export async function getClient(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      requests: {
        select: {
          id: true, requestNumber: true, status: true,
          destinationCity: true, destinationCountry: true, createdAt: true,
        },
        orderBy: { createdAt: "desc" as const },
        take: 10,
      }
    },
  });

  if (!client) throw new ApiError("Cliente no encontrado", 404, "CLIENT_NOT_FOUND");
  
  sendItem(res, client);
}

// ─────────────────────────────────────────────────────────────────────
//  CREAR CLIENTE
// ─────────────────────────────────────────────────────────────────────
export async function createClient(req: Request, res: Response): Promise<void> {
  // Nota: Los datos ya llegan validados desde el middleware validate() en la ruta
  const data = req.body;

  if (data.rut) {
    const existingRut = await prisma.client.findFirst({ where: { rut: data.rut } });
    if (existingRut) throw new ApiError(`Ya existe un cliente con el RUT ${data.rut}`, 409, "DUPLICATE_RUT");
  }

  if (data.email) {
    const existingEmail = await prisma.client.findFirst({ where: { email: data.email } });
    if (existingEmail) throw new ApiError(`Ya existe un cliente con el email ${data.email}`, 409, "DUPLICATE_EMAIL");
  }

  const client = await prisma.client.create({
    data: { ...data, createdBy: req.user!.id },
  });

  await createActivityLog({
    action: "CREATE", entityType: "Client", entityId: client.id,
    entityLabel: `${client.firstName} ${client.lastName}`,
    performedBy: req.user!.id,
  });

  sendItem(res, client, 201);
}

// ─────────────────────────────────────────────────────────────────────
//  ACTUALIZAR CLIENTE
// ─────────────────────────────────────────────────────────────────────
export async function updateClient(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const existing = await prisma.client.findUnique({ where: { id } });
  
  if (!existing) throw new ApiError("Cliente no encontrado", 404, "CLIENT_NOT_FOUND");

  const data = req.body;

  if (data.rut && data.rut !== existing.rut) {
    const dup = await prisma.client.findFirst({ where: { rut: data.rut, NOT: { id } } });
    if (dup) throw new ApiError(`El RUT ${data.rut} ya está registrado en otro cliente`, 409, "DUPLICATE_RUT");
  }

  if (data.email && data.email !== existing.email) {
    const dup = await prisma.client.findFirst({ where: { email: data.email, NOT: { id } } });
    if (dup) throw new ApiError(`El email ${data.email} ya está registrado en otro cliente`, 409, "DUPLICATE_EMAIL");
  }

  const updated = await prisma.client.update({
    where: { id },
    data,
  });

  await createActivityLog({
    action: "UPDATE", entityType: "Client", entityId: updated.id,
    entityLabel: `${updated.firstName} ${updated.lastName}`,
    performedBy: req.user!.id,
  });

  sendItem(res, updated);
}

// ─────────────────────────────────────────────────────────────────────
//  ACTIVAR / DESACTIVAR CLIENTE
// ─────────────────────────────────────────────────────────────────────
export async function toggleClientActive(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const existing = await prisma.client.findUnique({
    where: { id },
    select: { id: true, firstName: true, lastName: true, isActive: true },
  });

  if (!existing) throw new ApiError("Cliente no encontrado", 404, "CLIENT_NOT_FOUND");

  const newStatus = !existing.isActive;

  const updated = await prisma.client.update({
    where: { id },
    data: { isActive: newStatus },
  });

  await createActivityLog({
    action: "UPDATE", entityType: "Client", entityId: id,
    entityLabel: `${existing.firstName} ${existing.lastName}`,
    description: `Cliente ${newStatus ? "activado" : "desactivado"}`,
    performedBy: req.user!.id,
  });

  res.json({ data: updated, message: `Cliente ${newStatus ? "activado" : "desactivado"} correctamente` });
}

// ─────────────────────────────────────────────────────────────────────
//  ELIMINAR CLIENTE (Hard Delete Protegido)
// ─────────────────────────────────────────────────────────────────────
export async function deleteClient(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const existing = await prisma.client.findUnique({ where: { id } });

  if (!existing) throw new ApiError("Cliente no encontrado", 404, "CLIENT_NOT_FOUND");

  const totalRelatedRequests = await prisma.request.count({ where: { clientId: id } });

  if (totalRelatedRequests > 0) {
    throw new ApiError("No se puede eliminar. El cliente tiene solicitudes comerciales activas asociadas.", 409, "CLIENT_HAS_RELATIONS");
  }

  await prisma.client.delete({ where: { id } });

  await createActivityLog({
    action: "DELETE", entityType: "Client", entityId: id,
    entityLabel: `${existing.firstName} ${existing.lastName}`,
    performedBy: req.user!.id,
  });

  sendItem(res, { ok: true, message: "Cliente eliminado correctamente" });
}