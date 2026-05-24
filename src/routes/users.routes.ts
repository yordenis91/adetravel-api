import { Router } from "express";
import { deleteUser, getUser, listUsers, updateUser, getUserStats } from "../controllers/users.controller";
import { validate } from "../middlewares/validation.middleware";
import { userIdParamSchema, usersListQuerySchema, updateUserSchema } from "../validators/users.validator";
import { asyncHandler } from "../utils/async-handler";
import { roleMiddleware } from "../middlewares/role.middleware";

export const usersRouter = Router();

// Permitimos acceso a ADMINISTRADOR y USUARIO (el controlador y auth restringen los detalles)
usersRouter.use(roleMiddleware(["ADMINISTRADOR", "USUARIO"]));

// Endpoint de estadísticas (¡Importante que vaya antes de /:id!)
usersRouter.get("/stats", asyncHandler(getUserStats));

usersRouter.get("/", validate(usersListQuerySchema, "query"), asyncHandler(listUsers));
usersRouter.get("/:id", validate(userIdParamSchema, "params"), asyncHandler(getUser));

// Actualización de perfiles
usersRouter.patch(
  "/:id",
  validate(userIdParamSchema, "params"),
  validate(updateUserSchema),
  asyncHandler(updateUser)
);

// Eliminación estricta solo para Administradores de sistema
usersRouter.delete(
  "/:id", 
  roleMiddleware(["ADMINISTRADOR"]), 
  validate(userIdParamSchema, "params"), 
  asyncHandler(deleteUser)
);