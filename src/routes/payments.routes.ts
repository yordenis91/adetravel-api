import { Router } from "express";
import { 
  createPayment, deletePayment, getPayment, listPayments, 
  updatePayment, changePaymentStatus, getPaymentStats 
} from "../controllers/payments.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, paymentsQuerySchema } from "../schemas/domain.schemas";
import { createPaymentSchema, updatePaymentSchema, changePaymentStatusSchema } from "../validators/payments.validator";
import { requirePermission } from "../middlewares/permission.middleware";

export const paymentsRouter = Router();

paymentsRouter.get("/", requirePermission("VIEW_PAYMENTS"), validate(paymentsQuerySchema, "query"), asyncHandler(listPayments));
paymentsRouter.get("/stats", requirePermission("VIEW_PAYMENTS"), asyncHandler(getPaymentStats));
paymentsRouter.get("/:id", requirePermission("VIEW_PAYMENTS"), validate(idSchema, "params"), asyncHandler(getPayment));

paymentsRouter.post("/", requirePermission("MANAGE_PAYMENTS"), validate(createPaymentSchema), asyncHandler(createPayment));
paymentsRouter.patch("/:id", requirePermission("MANAGE_PAYMENTS"), validate(idSchema, "params"), validate(updatePaymentSchema), asyncHandler(updatePayment));
paymentsRouter.patch("/:id/status", requirePermission("MANAGE_PAYMENTS"), validate(idSchema, "params"), validate(changePaymentStatusSchema), asyncHandler(changePaymentStatus));

// Eliminación estricta
paymentsRouter.delete("/:id", requirePermission("DELETE_PAYMENT"), validate(idSchema, "params"), asyncHandler(deletePayment));