import { Router } from "express";
import {
  createEmailTemplate,
  deleteEmailTemplate,
  getEmailTemplate,
  listEmailTemplates,
  updateEmailTemplate
} from "../controllers/email-templates.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import {
  emailTemplateCreateSchema,
  emailTemplateUpdateSchema,
  emailTemplatesQuerySchema,
  idSchema
} from "../schemas/domain.schemas";

export const emailTemplatesRouter = Router();
emailTemplatesRouter.get("/", validate(emailTemplatesQuerySchema, "query"), asyncHandler(listEmailTemplates));
emailTemplatesRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getEmailTemplate));
emailTemplatesRouter.post("/", validate(emailTemplateCreateSchema), asyncHandler(createEmailTemplate));
emailTemplatesRouter.patch("/:id", validate(idSchema, "params"), validate(emailTemplateUpdateSchema), asyncHandler(updateEmailTemplate));
emailTemplatesRouter.delete("/:id", validate(idSchema, "params"), asyncHandler(deleteEmailTemplate));
