import { NextFunction, Request, Response } from "express";
import { sendError } from "../utils/response";
import { Permission, hasPermission } from "../config/permissions";

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, "No autenticado", "UNAUTHORIZED", 401);
      return;
    }

    const { role, agencyRole } = req.user as { role: string; agencyRole?: string | null };

    // Verificamos si el usuario tiene el permiso exacto
    if (!hasPermission(role, agencyRole, permission)) {
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