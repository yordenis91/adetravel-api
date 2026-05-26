import { Router } from "express";
import { 
  createQuotation, deleteQuotation, getQuotation, listQuotations, 
  updateQuotation, changeQuotationStatus, previewQuotation, duplicateQuotation 
} from "../controllers/quotations.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, quotationsQuerySchema } from "../schemas/domain.schemas";
import { createQuotationSchema, updateQuotationSchema, changeStatusSchema } from "../validators/quotations.validator";
import { requirePermission } from "../middlewares/permission.middleware";

export const quotationsRouter = Router();

quotationsRouter.get("/", requirePermission("VIEW_QUOTATIONS"), validate(quotationsQuerySchema, "query"), asyncHandler(listQuotations));
quotationsRouter.get("/:id", requirePermission("VIEW_QUOTATIONS"), validate(idSchema, "params"), asyncHandler(getQuotation));
quotationsRouter.get("/:id/preview", requirePermission("VIEW_QUOTATIONS"), validate(idSchema, "params"), asyncHandler(previewQuotation));

quotationsRouter.post("/", requirePermission("MANAGE_QUOTATIONS"), validate(createQuotationSchema), asyncHandler(createQuotation));
quotationsRouter.post("/:id/duplicate", requirePermission("MANAGE_QUOTATIONS"), validate(idSchema, "params"), asyncHandler(duplicateQuotation));
quotationsRouter.patch("/:id", requirePermission("MANAGE_QUOTATIONS"), validate(idSchema, "params"), validate(updateQuotationSchema), asyncHandler(updateQuotation));
quotationsRouter.patch("/:id/status", requirePermission("MANAGE_QUOTATIONS"), validate(idSchema, "params"), validate(changeStatusSchema), asyncHandler(changeQuotationStatus));

// Eliminación estricta
quotationsRouter.delete("/:id", requirePermission("DELETE_QUOTATION"), validate(idSchema, "params"), asyncHandler(deleteQuotation));