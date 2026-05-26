import { Router } from "express";
import { getSystemConfig, syncExchangeRates, upsertSystemConfig } from "../controllers/system-config.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { systemConfigUpsertSchema } from "../schemas/domain.schemas";
// 🔥 Importamos el nuevo middleware
import { requirePermission } from "../middlewares/permission.middleware";

export const systemConfigRouter = Router();

// Cualquiera con acceso al panel de configuración (o para leer el nombre de agencia)
systemConfigRouter.get("/", requirePermission("MANAGE_SYSTEM_CONFIG"), asyncHandler(getSystemConfig));

// Edición de configuración global
systemConfigRouter.put("/", requirePermission("MANAGE_SYSTEM_CONFIG"), validate(systemConfigUpsertSchema), asyncHandler(upsertSystemConfig));

// Sincronización manual de divisas
systemConfigRouter.post("/sync", requirePermission("MANAGE_SYSTEM_CONFIG"), asyncHandler(syncExchangeRates));