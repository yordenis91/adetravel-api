import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";

export async function listUsers(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const { search, agencyRole, isActive } = req.query as any;

  const where: any = {};
  
  if (agencyRole) where.agencyRole = agencyRole;
  if (isActive !== undefined) {
    where.isActive = (isActive === "true" || isActive === true);
  }
  
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } }
    ];
  }

  // Ejecución secuencial para evitar advertencias de concurrencia en pg
  const total = await prisma.user.count({ where });
  const data = await prisma.user.findMany({ 
    where, skip, take: limit, 
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, fullName: true, role: true, agencyRole: true, isActive: true, createdAt: true }
  });

  sendList(res, data, total, page, limit);
}

export async function getUserStats(req: Request, res: Response): Promise<void> {
  const total = await prisma.user.count();
  const administradores = await prisma.user.count({ where: { role: "ADMINISTRADOR" } });
  const equipoOperativo = await prisma.user.count({
    where: { agencyRole: { in: ["GERENTE", "FINANZAS", "OPERACIONES", "AGENTE_VENTAS"] } } // Actualizado a los nuevos roles
  });
  
  sendItem(res, { total, administradores, equipoOperativo });
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const userId = String(req.params.id);
  const user = await prisma.user.findUnique({ 
    where: { id: userId },
    select: { id: true, email: true, fullName: true, role: true, agencyRole: true, isActive: true, createdAt: true }
  });
  if (!user) throw new ApiError("Usuario no encontrado", 404, "USER_NOT_FOUND");
  
  sendItem(res, user);
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const targetUserId = String(req.params.id);
  const currentUser = req.user as { id: string; role: string; agencyRole?: string | null };
  const updates = req.body;

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) throw new ApiError("Usuario no encontrado", 404);

  // 🛡️ REGLAS DE SEGURIDAD INTERNAS (Protección contra uno mismo)
  
  // 1. Evitar que alguien cambie su propio rol (incluso un Gerente)
  if ((updates.agencyRole || updates.role) && currentUser.id === targetUserId) {
    throw new ApiError("Por seguridad, no puedes modificar tu propio rol. Solicítalo a otro administrador.", 403);
  }

  // 2. Evitar suicidio digital (desactivar propia cuenta)
  if (updates.isActive !== undefined && currentUser.id === targetUserId && updates.isActive === false) {
    throw new ApiError("No puedes desactivar tu propia cuenta.", 403);
  }

// 🔥 NUEVO: Si el admin envía una nueva contraseña, la encriptamos de forma segura
  if (updates.password) {
    updates.passwordHash = await bcrypt.hash(updates.password, 12);
    delete updates.password; // Borramos el texto plano para que Prisma no dé error
  }
  
  // Actualización limpia en Prisma
  const user = await prisma.user.update({
    where: { id: targetUserId },
    data: updates,
    select: { id: true, email: true, fullName: true, role: true, agencyRole: true, isActive: true }
  });

  await createActivityLog({
    action: "UPDATE",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.email,
    performedBy: currentUser.id
  });

  sendItem(res, user);
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const userId = String(req.params.id);
  
  if (req.user!.id === userId) {
    throw new ApiError("No puedes eliminar tu propia cuenta del sistema.", 403);
  }

  const user = await prisma.user.delete({ where: { id: userId } });
  
  await createActivityLog({
    action: "DELETE",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.email,
    performedBy: req.user?.id
  });

  sendItem(res, { ok: true, message: "Usuario eliminado correctamente" });
}