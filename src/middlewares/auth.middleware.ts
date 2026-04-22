import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { sendError } from "../utils/response";

const tokenBlacklist = new Set<string>();

export function blacklistToken(token: string): void {
  tokenBlacklist.add(token);
}

interface AuthTokenPayload extends JwtPayload {
  id: string;
  email: string;
  role: "ADMINISTRADOR" | "USUARIO";
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    sendError(res, "Token no proporcionado", "UNAUTHORIZED", 401);
    return;
  }

  const token = authHeader.replace("Bearer ", "");
  if (tokenBlacklist.has(token)) {
    sendError(res, "Token invalidado", "UNAUTHORIZED", 401);
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, role: true, isActive: true }
    });

    if (!user || !user.isActive) {
      sendError(res, "Usuario no autorizado", "UNAUTHORIZED", 401);
      return;
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch {
    sendError(res, "Token inválido", "UNAUTHORIZED", 401);
  }
}
