import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { sendItem } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { blacklistToken } from "../middlewares/auth.middleware";
import { sendEmail } from "../services/email.service";

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    throw new ApiError("Credenciales inválidas", 401, "INVALID_CREDENTIALS");
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new ApiError("Credenciales inválidas", 401, "INVALID_CREDENTIALS");
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN
  });

  sendItem(res, {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      agencyRole: user.agencyRole
    }
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) blacklistToken(token);
  sendItem(res, { ok: true });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, fullName: true, role: true, agencyRole: true, phone: true, department: true, isActive: true }
  });
  if (!user) throw new ApiError("Usuario no encontrado", 404, "USER_NOT_FOUND");
  sendItem(res, user);
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: req.body as { fullName?: string; phone?: string; department?: string }
  });
  sendItem(res, user);
}

export async function inviteUser(req: Request, res: Response): Promise<void> {
  const { email, fullName, role, agencyRole, password } = req.body as {
    email: string;
    fullName: string;
    role: "ADMINISTRADOR" | "USUARIO";
    agencyRole?: "GERENTE" | "AGENTE_SENIOR" | "AGENTE" | "ASISTENTE";
    password: string;
  };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError("El usuario ya existe", 409, "USER_ALREADY_EXISTS");

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, fullName, role, agencyRole, passwordHash: hash, createdAt: new Date(), updatedAt: new Date() }
  });

  await sendEmail({
    to: email,
    subject: "Invitación AdeTravel",
    html: `<p>Hola ${fullName}, tu usuario fue creado en AdeTravel.</p>`
  });

  sendItem(res, { id: user.id, email: user.email, fullName: user.fullName, role: user.role }, 201);
}
