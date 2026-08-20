import { Router } from "express";
import {
  createConfirmation, deleteConfirmation, getConfirmation, listConfirmations, updateConfirmation
} from "../controllers/confirmations.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, confirmationsQuerySchema } from "../schemas/domain.schemas";
import { createConfirmationSchema, updateConfirmationSchema } from "../validators/confirmations.validator";
import { requirePermission } from "../middlewares/permission.middleware";

export const confirmationsRouter = Router();

confirmationsRouter.get("/", requirePermission("VIEW_CONFIRMATIONS"), validate(confirmationsQuerySchema, "query"), asyncHandler(listConfirmations));
confirmationsRouter.get("/:id", requirePermission("VIEW_CONFIRMATIONS"), validate(idSchema, "params"), asyncHandler(getConfirmation));

confirmationsRouter.post("/", requirePermission("MANAGE_CONFIRMATIONS"), validate(createConfirmationSchema), asyncHandler(createConfirmation));

confirmationsRouter.patch("/:id", requirePermission("MANAGE_CONFIRMATIONS"), validate(idSchema, "params"), validate(updateConfirmationSchema), asyncHandler(updateConfirmation));

confirmationsRouter.delete("/:id", requirePermission("DELETE_CONFIRMATION"), validate(idSchema, "params"), asyncHandler(deleteConfirmation));
