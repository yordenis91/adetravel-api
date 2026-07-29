import { Router } from "express";
import { getNotifications, markAsRead, markAllAsRead, deleteNotification, getNotificationStats } from "../controllers/notifications.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema } from "../schemas/domain.schemas";

export const notificationsRouter = Router();

// Obtener mis notificaciones
notificationsRouter.get("/", asyncHandler(getNotifications));

// Obtener estadísticas de notificaciones
notificationsRouter.get("/stats", asyncHandler(getNotificationStats));

// Marcar todas como leídas (antes de :id para evitar conflictos)
notificationsRouter.patch("/read-all", asyncHandler(markAllAsRead));

// Marcar una notificación como leída
notificationsRouter.patch("/:id/read", validate(idSchema, "params"), asyncHandler(markAsRead));

// Eliminar una notificación específica
notificationsRouter.delete("/:id", validate(idSchema, "params"), asyncHandler(deleteNotification));
