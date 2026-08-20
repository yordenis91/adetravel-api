import { Router } from "express";
import {
  createService, deleteService, getService, listServices, updateService,
  changeServiceStatus, getServiceStats
} from "../controllers/services.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, servicesQuerySchema } from "../schemas/domain.schemas";
import { createServiceSchema, updateServiceSchema } from "../validators/services.validator";
import { changeStatusSchema } from "../validators/workflow-status";
import { requirePermission } from "../middlewares/permission.middleware";

export const servicesRouter = Router();

servicesRouter.get("/stats", requirePermission("VIEW_SERVICES"), asyncHandler(getServiceStats));
servicesRouter.get("/", requirePermission("VIEW_SERVICES"), validate(servicesQuerySchema, "query"), asyncHandler(listServices));
servicesRouter.get("/:id", requirePermission("VIEW_SERVICES"), validate(idSchema, "params"), asyncHandler(getService));

servicesRouter.post("/", requirePermission("MANAGE_SERVICES"), validate(createServiceSchema), asyncHandler(createService));

servicesRouter.patch("/:id", requirePermission("MANAGE_SERVICES"), validate(idSchema, "params"), validate(updateServiceSchema), asyncHandler(updateService));
servicesRouter.patch("/:id/status", requirePermission("MANAGE_SERVICES"), validate(idSchema, "params"), validate(changeStatusSchema), asyncHandler(changeServiceStatus));

servicesRouter.delete("/:id", requirePermission("DELETE_SERVICE"), validate(idSchema, "params"), asyncHandler(deleteService));
