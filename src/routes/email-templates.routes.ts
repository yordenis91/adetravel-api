import { Router } from "express";
import {
  createEmailTemplate, deleteEmailTemplate, getEmailTemplate, listEmailTemplates, updateEmailTemplate,
  getTemplateVariables, previewTemplate, duplicateTemplate, toggleTemplate
} from "../controllers/email-templates.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { roleMiddleware } from "../middlewares/role.middleware";
import { idSchema } from "../schemas/domain.schemas";
import { 
  createTemplateSchema, updateTemplateSchema, listTemplatesSchema, previewTemplateSchema, toggleTemplateSchema 
} from "../validators/email-templates.validator";

export const emailTemplatesRouter = Router();

// 🛡️ Proteger todo el módulo para personal administrativo o de gerencia
emailTemplatesRouter.use(roleMiddleware(["ADMINISTRADOR", "USUARIO"]));

// Endpoints utilitarios
emailTemplatesRouter.get("/variables", asyncHandler(getTemplateVariables));
emailTemplatesRouter.post("/preview", validate(previewTemplateSchema), asyncHandler(previewTemplate));
emailTemplatesRouter.post("/:id/duplicate", validate(idSchema, "params"), asyncHandler(duplicateTemplate));
emailTemplatesRouter.patch("/:id/toggle", validate(idSchema, "params"), validate(toggleTemplateSchema), asyncHandler(toggleTemplate));

// CRUD Estándar
emailTemplatesRouter.get("/", validate(listTemplatesSchema, "query"), asyncHandler(listEmailTemplates));
emailTemplatesRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getEmailTemplate));
emailTemplatesRouter.post("/", validate(createTemplateSchema), asyncHandler(createEmailTemplate));
emailTemplatesRouter.patch("/:id", validate(idSchema, "params"), validate(updateTemplateSchema), asyncHandler(updateEmailTemplate));
emailTemplatesRouter.delete("/:id", validate(idSchema, "params"), asyncHandler(deleteEmailTemplate));