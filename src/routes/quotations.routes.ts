import { Router } from "express";
import { createQuotation, deleteQuotation, getQuotation, listQuotations, updateQuotation } from "../controllers/quotations.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, quotationCreateSchema, quotationUpdateSchema, quotationsQuerySchema } from "../schemas/domain.schemas";

export const quotationsRouter = Router();
quotationsRouter.get("/", validate(quotationsQuerySchema, "query"), asyncHandler(listQuotations));
quotationsRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getQuotation));
quotationsRouter.post("/", validate(quotationCreateSchema), asyncHandler(createQuotation));
quotationsRouter.patch("/:id", validate(idSchema, "params"), validate(quotationUpdateSchema), asyncHandler(updateQuotation));
quotationsRouter.delete("/:id", validate(idSchema, "params"), asyncHandler(deleteQuotation));
