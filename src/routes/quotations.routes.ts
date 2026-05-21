import { Router } from "express";
import { 
  createQuotation, deleteQuotation, getQuotation, listQuotations, 
  updateQuotation, changeQuotationStatus, previewQuotation, duplicateQuotation 
} from "../controllers/quotations.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, quotationsQuerySchema } from "../schemas/domain.schemas";
import { createQuotationSchema, updateQuotationSchema, changeStatusSchema } from "../validators/quotations.validator";
import { roleMiddleware } from "../middlewares/role.middleware";

export const quotationsRouter = Router();

quotationsRouter.get("/", validate(quotationsQuerySchema, "query"), asyncHandler(listQuotations));
quotationsRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getQuotation));

// 🌟 AQUÍ ESTÁ EL CAMBIO: Cambiamos /pdf por /preview
quotationsRouter.get("/:id/preview", validate(idSchema, "params"), asyncHandler(previewQuotation));

quotationsRouter.post("/", validate(createQuotationSchema), asyncHandler(createQuotation));
quotationsRouter.post("/:id/duplicate", validate(idSchema, "params"), asyncHandler(duplicateQuotation));
quotationsRouter.patch("/:id", validate(idSchema, "params"), validate(updateQuotationSchema), asyncHandler(updateQuotation));

// Endpoint dedicado al flujo de estados
quotationsRouter.patch("/:id/status", validate(idSchema, "params"), validate(changeStatusSchema), asyncHandler(changeQuotationStatus));

quotationsRouter.delete("/:id", validate(idSchema, "params"), roleMiddleware(["ADMINISTRADOR"]), asyncHandler(deleteQuotation));