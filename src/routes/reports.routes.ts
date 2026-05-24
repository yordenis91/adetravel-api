import { Router } from "express";
import { getReport } from "../controllers/reports.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { roleMiddleware } from "../middlewares/role.middleware";
import { getReportSchema } from "../validators/reports.validator";

export const reportsRouter = Router();

// 🛡️ Solo los Gerentes o Administradores pueden ver estadísticas financieras
reportsRouter.use(roleMiddleware(["ADMINISTRADOR", "USUARIO"]));

// GET /api/reports -> Obtiene todo el dashboard
reportsRouter.get("/", validate(getReportSchema, "query"), asyncHandler(getReport));