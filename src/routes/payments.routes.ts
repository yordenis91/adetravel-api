import { Router } from "express";
import { 
  createPayment, deletePayment, getPayment, listPayments, 
  updatePayment, changePaymentStatus, getPaymentStats 
} from "../controllers/payments.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, paymentsQuerySchema } from "../schemas/domain.schemas";
import { createPaymentSchema, updatePaymentSchema, changePaymentStatusSchema } from "../validators/payments.validator";
import { roleMiddleware } from "../middlewares/role.middleware";

export const paymentsRouter = Router();

paymentsRouter.get("/", validate(paymentsQuerySchema, "query"), asyncHandler(listPayments));

// Endpoint de estadísticas (¡Importante que vaya ANTES que el /:id!)
paymentsRouter.get("/stats", asyncHandler(getPaymentStats));

paymentsRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getPayment));

paymentsRouter.post("/", validate(createPaymentSchema), asyncHandler(createPayment));
paymentsRouter.patch("/:id", validate(idSchema, "params"), validate(updatePaymentSchema), asyncHandler(updatePayment));

// Endpoint dedicado al cambio de estados
paymentsRouter.patch("/:id/status", validate(idSchema, "params"), validate(changePaymentStatusSchema), asyncHandler(changePaymentStatus));

paymentsRouter.delete("/:id", validate(idSchema, "params"), roleMiddleware(["ADMINISTRADOR"]), asyncHandler(deletePayment));