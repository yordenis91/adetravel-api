import { Router } from "express";
import { getNotifications, markAsRead, markAllAsRead } from "../controllers/notifications.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema } from "../schemas/domain.schemas";

export const notificationsRouter = Router();

// Obtener mis notificaciones
notificationsRouter.get("/", asyncHandler(getNotifications));

// Marcar una notificación como leída
notificationsRouter.patch("/:id/read", validate(idSchema, "params"), asyncHandler(markAsRead));

// Marcar todas como leídas
notificationsRouter.patch("/read-all", asyncHandler(markAllAsRead));
