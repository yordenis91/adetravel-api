import { NextFunction, Request, Response } from "express";
import { sendError } from "../utils/response";
import { Permission, hasPermissionAsync } from "../config/permissions";
import { prisma } from "../lib/prisma";

// Express 5 propaga automáticamente los rechazos de promesas de un
// middleware async al error handler, así que no necesita un wrapper
// como asyncHandler (eso es solo para los controllers de las rutas).
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      sendError(res, "No autenticado", "UNAUTHORIZED", 401);
      return;
    }

    const { id, role, agencyRole } = req.user;

    const allowed = await hasPermissionAsync(prisma, id, role, agencyRole, permission);
    if (!allowed) {
      sendError(
        res,
        "No tienes los permisos necesarios para realizar esta acción.",
        "FORBIDDEN",
        403
      );
      return;
    }

    next();
  };
}