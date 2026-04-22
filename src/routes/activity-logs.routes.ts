import { Router } from "express";
import { listActivityLogs } from "../controllers/activity-logs.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { activityLogQuerySchema } from "../schemas/domain.schemas";

export const activityLogsRouter = Router();
activityLogsRouter.get("/", validate(activityLogQuerySchema, "query"), asyncHandler(listActivityLogs));
