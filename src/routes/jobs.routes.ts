import { Router } from "express";
import { runOverdueNotificationsNow } from "../controllers/jobs.controller";
import { requirePermission } from "../middlewares/permission.middleware";
import { asyncHandler } from "../utils/async-handler";

export const jobsRouter = Router();

jobsRouter.post(
  "/overdue-notifications/run",
  requirePermission("RUN_JOBS"),
  asyncHandler(runOverdueNotificationsNow)
);
