import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "./prisma";

/**
 * Tokens de sesión. Cada token lleva:
 * - `tv` (tokenVersion del usuario al emitirlo): cambiar o restablecer la contraseña incrementa
 *   la versión y deja inválidos todos los tokens anteriores.
 * - `jti` (identificador único): el logout lo guarda en `revoked_tokens` hasta que caduca, así la
 *   revocación sobrevive a los despliegues (antes vivía en memoria y se perdía al reiniciar).
 */
export interface TokenUser {
  id: string;
  email: string;
  role: string;
  tokenVersion: number;
}

export function signAccessToken(user: TokenUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, tv: user.tokenVersion },
    env.JWT_SECRET as jwt.Secret,
    { expiresIn: env.JWT_EXPIRES_IN || "7d", jwtid: crypto.randomUUID() } as jwt.SignOptions
  );
}

/** Revoca un token concreto (logout). Los tokens antiguos sin jti no se pueden revocar aquí. */
export async function revokeToken(payload: { jti?: string; exp?: number }): Promise<boolean> {
  if (!payload.jti || !payload.exp) return false;
  const expiresAt = new Date(payload.exp * 1000);
  await prisma.revokedToken.upsert({
    where: { jti: payload.jti },
    update: {},
    create: { jti: payload.jti, expiresAt },
  });
  // Limpieza oportunista: los ya caducados no hace falta recordarlos.
  await prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return true;
}

export async function isTokenRevoked(jti: string | undefined): Promise<boolean> {
  if (!jti) return false;
  return !!(await prisma.revokedToken.findUnique({ where: { jti } }));
}
