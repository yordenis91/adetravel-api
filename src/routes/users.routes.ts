import { Router } from "express";
import { deleteUser, getUser, listUsers, updateUser, getUserStats } from "../controllers/users.controller";
import { validate } from "../middlewares/validation.middleware";
import { userIdParamSchema, usersListQuerySchema, updateUserSchema } from "../validators/users.validator";
import { asyncHandler } from "../utils/async-handler";
// 🔥 NUEVO: Importamos el guardia de permisos basado en roles (RBAC)
import { requirePermission } from "../middlewares/permission.middleware";

export const usersRouter = Router();

// Endpoint de estadísticas (Solo quienes tienen permiso para ver usuarios)
usersRouter.get(
  "/stats", 
  requirePermission("VIEW_USERS"), 
  asyncHandler(getUserStats)
);

// Listar todos los usuarios
usersRouter.get(
  "/", 
  requirePermission("VIEW_USERS"), 
  validate(usersListQuerySchema, "query"), 
  asyncHandler(listUsers)
);

// Obtener un usuario específico
usersRouter.get(
  "/:id", 
  requirePermission("VIEW_USERS"), 
  validate(userIdParamSchema, "params"), 
  asyncHandler(getUser)
);

// Actualización de perfiles (Solo roles con permisos de gestión, ej. Gerente y Admin)
usersRouter.patch(
  "/:id",
  requirePermission("MANAGE_USERS"),
  validate(userIdParamSchema, "params"),
  validate(updateUserSchema),
  asyncHandler(updateUser)
);

// Eliminación de usuarios
usersRouter.delete(
  "/:id", 
  // Usamos MANAGE_USERS (o podrías crear un permiso específico "DELETE_USERS" en tu matriz si quieres ser aún más estricto)
  requirePermission("MANAGE_USERS"), 
  validate(userIdParamSchema, "params"), 
  asyncHandler(deleteUser)
);