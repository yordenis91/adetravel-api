import { Router } from "express";
import {
  createEmailTemplate, deleteEmailTemplate, getEmailTemplate, listEmailTemplates, updateEmailTemplate,
  getTemplateVariables, previewTemplate, duplicateTemplate, toggleTemplate
} from "../controllers/email-templates.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
// 🔥 Importamos el nuevo middleware
import { requirePermission } from "../middlewares/permission.middleware";
import { idSchema } from "../schemas/domain.schemas";
import { 
  createTemplateSchema, updateTemplateSchema, listTemplatesSchema, previewTemplateSchema, toggleTemplateSchema 
} from "../validators/email-templates.validator";

export const emailTemplatesRouter = Router();

// Lectura y Utilidades
emailTemplatesRouter.get("/variables", requirePermission("VIEW_TEMPLATES"), asyncHandler(getTemplateVariables));
emailTemplatesRouter.post("/preview", requirePermission("VIEW_TEMPLATES"), validate(previewTemplateSchema), asyncHandler(previewTemplate));
emailTemplatesRouter.get("/", requirePermission("VIEW_TEMPLATES"), validate(listTemplatesSchema, "query"), asyncHandler(listEmailTemplates));
emailTemplatesRouter.get("/:id", requirePermission("VIEW_TEMPLATES"), validate(idSchema, "params"), asyncHandler(getEmailTemplate));

// Escritura y Edición
emailTemplatesRouter.post("/:id/duplicate", requirePermission("MANAGE_TEMPLATES"), validate(idSchema, "params"), asyncHandler(duplicateTemplate));
emailTemplatesRouter.patch("/:id/toggle", requirePermission("MANAGE_TEMPLATES"), validate(idSchema, "params"), validate(toggleTemplateSchema), asyncHandler(toggleTemplate));
emailTemplatesRouter.post("/", requirePermission("MANAGE_TEMPLATES"), validate(createTemplateSchema), asyncHandler(createEmailTemplate));
emailTemplatesRouter.patch("/:id", requirePermission("MANAGE_TEMPLATES"), validate(idSchema, "params"), validate(updateTemplateSchema), asyncHandler(updateEmailTemplate));

// Eliminación estricta
emailTemplatesRouter.delete("/:id", requirePermission("DELETE_TEMPLATE"), validate(idSchema, "params"), asyncHandler(deleteEmailTemplate));