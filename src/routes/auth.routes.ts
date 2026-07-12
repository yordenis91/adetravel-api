import { Router } from "express";
import { 
  inviteUser, 
  login, 
  logout, 
  getMe, 
  updateMe, 
  register,
  forgotPassword,
  validateResetToken,
  resetPassword,
} from "../controllers/auth.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { inviteSchema, loginSchema, registerSchema, updateMeSchema } from "../schemas/auth.schemas";
import { authMiddleware } from "../middlewares/auth.middleware";
// 🔥 Importamos el nuevo middleware
import { requirePermission } from "../middlewares/permission.middleware";
import { 
  forgotPasswordLimiter, 
  resetPasswordLimiter, 
  validateTokenLimiter 
} from "../middlewares/rate-limit.middleware";

export const authRouter = Router();

// Rutas públicas / de sesión
authRouter.post("/register", validate(registerSchema), asyncHandler(register));
authRouter.post("/login", validate(loginSchema), asyncHandler(login));
authRouter.post("/logout", authMiddleware, asyncHandler(logout));

// Perfil propio (Cualquier usuario autenticado puede acceder)
authRouter.get("/me", authMiddleware, asyncHandler(getMe));
authRouter.patch("/me", authMiddleware, validate(updateMeSchema), asyncHandler(updateMe));

// Invitación de nuevos usuarios
authRouter.post(
  "/invite",
  authMiddleware,
  requirePermission("MANAGE_USERS"), // Solo quienes puedan gestionar usuarios
  validate(inviteSchema),
  asyncHandler(inviteUser)
);

// 🔐 Recuperación de contraseña (Rutas públicas con Rate Limiting)
authRouter.post("/forgot-password", forgotPasswordLimiter, asyncHandler(forgotPassword));
authRouter.post("/validate-reset-token", validateTokenLimiter, asyncHandler(validateResetToken));
authRouter.post("/reset-password", resetPasswordLimiter, asyncHandler(resetPassword));