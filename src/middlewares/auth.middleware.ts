import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

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
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Token de autenticación no proporcionado",
        code: "NO_TOKEN"
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    if (tokenBlacklist.has(token)) {
      res.status(401).json({
        error: "Token invalidado",
        code: "TOKEN_INVALIDATED"
      });
      return;
    }

    let decoded: AuthTokenPayload;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET as string) as AuthTokenPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          error: "La sesión ha expirado. Por favor inicie sesión nuevamente.",
          code: "TOKEN_EXPIRED"
        });
        return;
      }
      res.status(401).json({
        error: "Token inválido",
        code: "INVALID_TOKEN"
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        agencyRole: true,
        isActive: true
      }
    });

    if (!user) {
      res.status(401).json({
        error: "Usuario no encontrado",
        code: "USER_NOT_FOUND"
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        error: "Tu cuenta ha sido desactivada. Contacta al administrador.",
        code: "USER_INACTIVE"
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Error en authMiddleware:", error);
    res.status(500).json({
      error: "Error interno del servidor",
      code: "INTERNAL_ERROR"
    });
  }
}
