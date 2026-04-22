import { UserRole } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { sendError } from "../utils/response";

export function roleMiddleware(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, "No autenticado", "UNAUTHORIZED", 401);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError(res, "No autorizado", "FORBIDDEN", 403);
      return;
    }

    next();
  };
}
