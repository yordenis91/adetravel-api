import { Router } from "express";
import { listActivityLogs, getActivityLogStats, purgeActivityLogs } from "../controllers/activity-logs.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
// 🔥 Importamos el nuevo middleware
import { requirePermission } from "../middlewares/permission.middleware";
import { listActivityLogSchema, statsActivityLogSchema, purgeActivityLogSchema } from "../validators/activity-log.validator";

export const activityLogsRouter = Router();

activityLogsRouter.get("/stats", requirePermission("VIEW_LOGS"), validate(statsActivityLogSchema, "query"), asyncHandler(getActivityLogStats));
activityLogsRouter.get("/", requirePermission("VIEW_LOGS"), validate(listActivityLogSchema, "query"), asyncHandler(listActivityLogs));

// Purgado de logs (Estricto)
activityLogsRouter.delete("/purge", requirePermission("PURGE_LOGS"), validate(purgeActivityLogSchema, "query"), asyncHandler(purgeActivityLogs));