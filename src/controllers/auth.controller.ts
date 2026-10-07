import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { sendItem, sendError } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { blacklistToken } from "../middlewares/auth.middleware";
import { revokeToken, signAccessToken } from "../lib/auth-tokens";
import { sendEmail } from "../services/email.service";
import { getEffectivePermissions } from "../config/permissions";
import { logger } from "../utils/logger";
import { passwordPolicyIssue } from "../utils/password-policy";

export async function register(req: Request, res: Response): Promise<void> {
  if (!env.ALLOW_PUBLIC_REGISTRATION) {
    throw new ApiError(
      "El registro público está deshabilitado. Pide una invitación a tu administrador.",
      403,
      "REGISTRATION_DISABLED"
    );
  }

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

  const token = signAccessToken(user);

  const { passwordHash: _, ...userSafe } = user;
  const permissions = await getEffectivePermissions(prisma, user.id, user.role, user.agencyRole);
  sendItem(res, { token, user: { ...userSafe, permissions } }, 201);
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

    const token = signAccessToken(user);

    const { passwordHash, ...userSafe } = user;
    const permissions = await getEffectivePermissions(prisma, user.id, user.role, user.agencyRole);
    sendItem(res, { token, user: { ...userSafe, permissions } });
  } catch (error) {
    logger.error({ err: error }, "Error en login");
    sendError(res, "Error interno del servidor", "INTERNAL_ERROR", 500);
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    // authMiddleware ya verificó la firma; aquí solo se lee el jti y la caducidad.
    const payload = jwt.decode(token) as jwt.JwtPayload | null;
    const revoked = payload ? await revokeToken(payload) : false;
    // Tokens emitidos antes del jti: solo se pueden recordar en memoria.
    if (!revoked) blacklistToken(token);
  }
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
        createdAt: true,
      },
    });

    if (!user) {
      throw new ApiError("Usuario no encontrado", 404, "USER_NOT_FOUND");
    }

    const permissions = await getEffectivePermissions(prisma, user.id, user.role, user.agencyRole);

    sendItem(res, { ...user, permissions });
  } catch (error) {
    logger.error({ err: error }, "Error en getMe");
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

      const policyIssue = passwordPolicyIssue(newPassword);
      if (policyIssue) {
        sendError(res, policyIssue, "WEAK_PASSWORD", 400);
        return;
      }

      updateData.passwordHash = await bcrypt.hash(newPassword, 12);
      // Invalida todas las sesiones abiertas con la contraseña anterior (también la actual):
      // la respuesta trae un token nuevo para seguir trabajando sin volver a iniciar sesión.
      updateData.tokenVersion = { increment: 1 };
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
        createdAt: true,
        tokenVersion: true,
      },
    });

    const permissions = await getEffectivePermissions(prisma, updated.id, updated.role, updated.agencyRole);
    const { tokenVersion, ...profile } = updated;
    const token = newPassword ? signAccessToken({ ...updated, tokenVersion }) : undefined;

    sendItem(res, { ...profile, permissions, ...(token ? { token } : {}) });
  } catch (error) {
    logger.error({ err: error }, "Error en updateMe");
    sendError(res, "Error interno del servidor", "INTERNAL_ERROR", 500);
  }
}

export async function inviteUser(req: Request, res: Response): Promise<void> {
  const { email, fullName, role, agencyRole, password } = req.body as {
    email: string;
    fullName: string;
    role: "ADMINISTRADOR" | "USUARIO";
    // 🔥 AQUÍ ESTÁ EL CAMBIO: Actualizamos a los nuevos roles
    agencyRole?: "GERENTE" | "FINANZAS" | "OPERACIONES" | "AGENTE_VENTAS"; 
    password: string;
  };

  // El login busca por email en minúsculas, así que se guarda igual aquí.
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new ApiError("El usuario ya existe", 409, "USER_ALREADY_EXISTS");

  const hash = await bcrypt.hash(password, 10);

  // Enlace de un solo uso para que la persona invitada defina su propia contraseña
  // (la que puso quien invita queda como respaldo, no se envía por correo).
  const inviteToken = generateResetToken();
  const inviteExpires = new Date(Date.now() + INVITE_LINK_TTL_MS);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      fullName,
      role,
      agencyRole,
      passwordHash: hash,
      resetPasswordToken: hashResetToken(inviteToken),
      resetPasswordExpires: inviteExpires,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // Si el SMTP falla o no está configurado, el usuario ya existe: se avisa en la
  // respuesta en vez de devolver un 500 que lo deja creado a medias.
  let emailSent = false;
  try {
    const link = `${env.FRONTEND_URL}/auth/reset-password/${inviteToken}`;
    await sendEmail({
      to: normalizedEmail,
      subject: "Invitación a AdeTravel",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #0A1128;">ADE Travel</h1>
          <p>Hola ${escapeHtml(fullName)}, te crearon un usuario en AdeTravel.</p>
          <p>Define tu contraseña desde este enlace (vence en 7 días):</p>
          <p><a href="${link}" style="background: #0A1128; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Crear mi contraseña</a></p>
          <p style="color: #666; font-size: 12px;">Si el botón no funciona, copia este enlace: ${link}</p>
          <p style="color: #666; font-size: 12px;">Tu usuario de acceso es ${escapeHtml(normalizedEmail)}.</p>
        </div>`,
    });
    emailSent = true;
  } catch (emailError) {
    logger.error({ err: emailError, userId: user.id }, "No se pudo enviar el correo de invitación");
  }

  sendItem(
    res,
    { id: user.id, email: user.email, fullName: user.fullName, role: user.role, emailSent },
    201
  );
}

const INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 🔐 Función auxiliar para generar un token seguro de recuperación
function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// 🔐 Función auxiliar para hashear el token
function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ─── ENDPOINTS DE RECUPERACIÓN DE CONTRASEÑA ───────────────────

/**
 * POST /api/auth/forgot-password
 * Solicita un enlace de recuperación de contraseña
 * Body: { email: string }
 * Respuesta: { success: boolean, message: string }
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      sendError(res, "El correo es requerido", "MISSING_EMAIL", 400);
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 🔒 NO REVELAR si el usuario existe o no (para evitar enumeración)
    // Buscamos el usuario
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Si existe, generamos el token y enviamos email
    if (user) {
      try {
        // Generar token seguro
        const resetToken = generateResetToken();
        const hashedToken = hashResetToken(resetToken);

        // Establecer expiración a 1 hora
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        // Guardar token hasheado en la base de datos
        await prisma.user.update({
          where: { id: user.id },
          data: {
            resetPasswordToken: hashedToken,
            resetPasswordExpires: expiresAt,
          },
        });

        // Construir el enlace de recuperación
        const resetLink = `${env.FRONTEND_URL || "http://localhost:5173"}/auth/reset-password/${resetToken}`;

        // Enviar email con el enlace
        await sendEmail({
          to: user.email,
          subject: "Recupera tu contraseña de AdeTravel",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #0A1128; margin: 0;">ADE Travel</h1>
                <p style="color: #999; margin: 10px 0 0 0;">Tu portal administrativo</p>
              </div>

              <div style="background: #f9fafb; border: 1px solid #e5e7eb; padding: 30px; border-radius: 8px;">
                <h2 style="color: #0A1128; margin-top: 0;">Recupera tu contraseña</h2>
                
                <p style="color: #333; line-height: 1.6;">
                  Recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, puedes ignorar este correo.
                </p>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${resetLink}" style="background: #0A1128; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                    Restablecer contraseña
                  </a>
                </div>

                <p style="color: #999; font-size: 12px; line-height: 1.6;">
                  O copia y pega este enlace en tu navegador:<br>
                  <code style="background: #e5e7eb; padding: 5px 10px; border-radius: 4px; word-break: break-all;">${resetLink}</code>
                </p>

                <p style="color: #999; font-size: 12px; margin-top: 20px;">
                  ⏰ Este enlace expirará en 1 hora.
                </p>
              </div>

              <div style="text-align: center; margin-top: 30px; color: #999; font-size: 12px;">
                <p>© ${new Date().getFullYear()} ADE Travel. Todos los derechos reservados.</p>
              </div>
            </div>
          `,
        });
      } catch (emailError) {
        logger.error({ err: emailError }, "Error enviando email de recuperación");
        // No revelar el error al usuario por seguridad
      }
    }

    // 🔒 Respondemos igual sea que el usuario exista o no
    sendItem(res, {
      success: true,
      message: "Si el correo existe en nuestro sistema, recibirás instrucciones para recuperar tu contraseña.",
    });
  } catch (error) {
    logger.error({ err: error }, "Error en forgotPassword");
    sendError(res, "Error interno del servidor", "INTERNAL_ERROR", 500);
  }
}

/**
 * POST /api/auth/validate-reset-token
 * Valida que un token de recuperación sea válido
 * Body: { token: string }
 * Respuesta: { valid: boolean }
 */
export async function validateResetToken(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body as { token?: string };

    if (!token) {
      sendError(res, "El token es requerido", "MISSING_TOKEN", 400);
      return;
    }

    const hashedToken = hashResetToken(token);

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: {
          gt: new Date(), // Verifica que no esté expirado
        },
      },
    });

    if (!user) {
      sendError(res, "El token es inválido o ha expirado", "INVALID_TOKEN", 400);
      return;
    }

    sendItem(res, { valid: true });
  } catch (error) {
    logger.error({ err: error }, "Error en validateResetToken");
    sendError(res, "Error interno del servidor", "INTERNAL_ERROR", 500);
  }
}

/**
 * POST /api/auth/reset-password
 * Restablece la contraseña del usuario
 * Body: { token: string, newPassword: string }
 * Respuesta: { success: boolean, message: string }
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };

    if (!token || !newPassword) {
      sendError(res, "El token y la contraseña son requeridos", "MISSING_FIELDS", 400);
      return;
    }

    // 🛡️ Validar requisitos de contraseña (política única en utils/password-policy)
    const policyIssue = passwordPolicyIssue(newPassword);
    if (policyIssue) {
      sendError(res, policyIssue, "WEAK_PASSWORD", 400);
      return;
    }

    const hashedToken = hashResetToken(token);

    // Buscar usuario con token válido y no expirado
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      sendError(res, "El token es inválido o ha expirado", "INVALID_TOKEN", 400);
      return;
    }

    // Hash de la nueva contraseña
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Actualizar la contraseña y limpiar los campos de recuperación
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        // Quien pidió el reset puede sospechar de un acceso ajeno: se cierran todas las sesiones.
        tokenVersion: { increment: 1 },
      },
    });

    sendItem(res, {
      success: true,
      message: "Tu contraseña ha sido restablecida correctamente.",
    });
  } catch (error) {
    logger.error({ err: error }, "Error en resetPassword");
    sendError(res, "Error interno del servidor", "INTERNAL_ERROR", 500);
  }
}
