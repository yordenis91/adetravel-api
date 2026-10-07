import { Router } from "express";
import { createProvider, deleteProvider, getProvider, listProviderOptions, listProviders, updateProvider } from "../controllers/providers.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, providerCreateSchema, providerUpdateSchema, providersQuerySchema } from "../schemas/domain.schemas";
import { requireAnyPermission, requirePermission } from "../middlewares/permission.middleware";

export const providersRouter = Router();

providersRouter.get("/", requirePermission("VIEW_PROVIDERS"), validate(providersQuerySchema, "query"), asyncHandler(listProviders));
// Lista mínima (id y nombre) para los selectores de Servicios, Confirmaciones y Vouchers: la usa
// quien trabaja con esos módulos aunque no pueda ver la ficha completa del proveedor (p. ej. ventas).
providersRouter.get("/options", requireAnyPermission("VIEW_PROVIDERS", "VIEW_SERVICES", "VIEW_CONFIRMATIONS", "VIEW_VOUCHERS"), asyncHandler(listProviderOptions));
providersRouter.get("/:id", requirePermission("VIEW_PROVIDERS"), validate(idSchema, "params"), asyncHandler(getProvider));

providersRouter.post("/", requirePermission("MANAGE_PROVIDERS"), validate(providerCreateSchema), asyncHandler(createProvider));
providersRouter.patch("/:id", requirePermission("MANAGE_PROVIDERS"), validate(idSchema, "params"), validate(providerUpdateSchema), asyncHandler(updateProvider));

// Eliminación estricta
providersRouter.delete("/:id", requirePermission("DELETE_PROVIDER"), validate(idSchema, "params"), asyncHandler(deleteProvider));