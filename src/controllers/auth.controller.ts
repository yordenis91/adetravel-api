import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { sendItem, sendError } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { blacklistToken } from "../middlewares/auth.middleware";
import { sendEmail } from "../services/email.service";

export async function register(req: Request, res: Response): Promise<void> {
  const { email, fullName, password } = req.body as {
    email: string;
    fullName: string;
    password: string;
  };

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (existing) {
    throw new ApiError("El correo ya está registrado", 409, "USER_ALREADY_EXISTS");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      fullName,
      passwordHash,
      role: "USUARIO",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    env.JWT_SECRET as jwt.Secret,
    { expiresIn: env.JWT_EXPIRES_IN || "7d" } as jwt.SignOptions
  );

  const { passwordHash: _, ...userSafe } = user;
  sendItem(res, { token, user: userSafe }, 201);
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      sendError(res, "Email y contraseña son requeridos", "MISSING_FIELDS", 400);
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      sendError(res, "Credenciales incorrectas", "INVALID_CREDENTIALS", 401);
      return;
    }

    if (!user.isActive) {
      sendError(res, "Tu cuenta ha sido desactivada. Contacta al administrador.", "USER_INACTIVE", 403);
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      sendError(res, "Credenciales incorrectas", "INVALID_CREDENTIALS", 401);
      return;
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      env.JWT_SECRET as jwt.Secret,
      { expiresIn: env.JWT_EXPIRES_IN || "7d" } as jwt.SignOptions
    );

    const { passwordHash, ...userSafe } = user;
    sendItem(res, { token, user: userSafe });
  } catch (error) {
    console.error("Error en login:", error);
    sendError(res, "Error interno del servidor", "INTERNAL_ERROR", 500);
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) blacklistToken(token);
  sendItem(res, { ok: true });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const authUser = req.user as { id: string };
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        agencyRole: true,
        department: true,
        phone: true,
        isActive: true,
      },
    });

    if (!user) {
      throw new ApiError("Usuario no encontrado", 404, "USER_NOT_FOUND");
    }

    sendItem(res, user);
  } catch (error) {
    console.error("Error en getMe:", error);
    sendError(res, "Error interno del servidor", "INTERNAL_ERROR", 500);
  }
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  try {
    const authUser = req.user as { id: string };
    const { fullName, phone, department, currentPassword, newPassword } = req.body as {
      fullName?: string;
      phone?: string;
      department?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    const updateData: any = {};
    if (fullName) updateData.fullName = fullName;
    if (phone) updateData.phone = phone;
    if (department) updateData.department = department;

    if (newPassword) {
      if (!currentPassword) {
        sendError(res, "Debes proporcionar tu contraseña actual", "CURRENT_PASSWORD_REQUIRED", 400);
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: authUser.id } });
      if (!user) {
        throw new ApiError("Usuario no encontrado", 404, "USER_NOT_FOUND");
      }

      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) {
        sendError(res, "La contraseña actual es incorrecta", "WRONG_PASSWORD", 400);
        return;
      }

      if (newPassword.length < 8) {
        sendError(res, "La nueva contraseña debe tener al menos 8 caracteres", "PASSWORD_TOO_SHORT", 400);
        return;
      }

      updateData.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    const updated = await prisma.user.update({
      where: { id: authUser.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        agencyRole: true,
        department: true,
        phone: true,
        isActive: true,
      },
    });

    sendItem(res, updated);
  } catch (error) {
    console.error("Error en updateMe:", error);
    sendError(res, "Error interno del servidor", "INTERNAL_ERROR", 500);
  }
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
    data: { email, fullName, role, agencyRole, passwordHash: hash, createdAt: new Date(), updatedAt: new Date() },
  });

  await sendEmail({
    to: email,
    subject: "Invitación AdeTravel",
    html: `<p>Hola ${fullName}, tu usuario fue creado en AdeTravel.</p>`,
  });

  sendItem(res, { id: user.id, email: user.email, fullName: user.fullName, role: user.role }, 201);
}
