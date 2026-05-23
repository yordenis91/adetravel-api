import { Router } from "express";
import { listActivityLogs, getActivityLogStats, purgeActivityLogs } from "../controllers/activity-logs.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { roleMiddleware } from "../middlewares/role.middleware";
import { listActivityLogSchema, statsActivityLogSchema, purgeActivityLogSchema } from "../validators/activity-log.validator";

export const activityLogsRouter = Router();

// Endpoint de estadísticas (Debe ir antes que las rutas genéricas)
activityLogsRouter.get("/stats", validate(statsActivityLogSchema, "query"), asyncHandler(getActivityLogStats));

// Listado y búsqueda
activityLogsRouter.get("/", validate(listActivityLogSchema, "query"), asyncHandler(listActivityLogs));

// Purgado de logs antiguos (Exclusivo para ADMIN)
activityLogsRouter.delete("/purge", roleMiddleware(["ADMINISTRADOR"]), validate(purgeActivityLogSchema, "query"), asyncHandler(purgeActivityLogs));