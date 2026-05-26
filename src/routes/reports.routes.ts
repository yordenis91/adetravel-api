import { Router } from "express";
import { getReport } from "../controllers/reports.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { getReportSchema } from "../validators/reports.validator";

export const reportsRouter = Router();

// Usamos el RBAC en lugar del middleware global de roles
reportsRouter.get("/", requirePermission("VIEW_REPORTS"), validate(getReportSchema, "query"), asyncHandler(getReport));