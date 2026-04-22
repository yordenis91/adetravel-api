import { Router } from "express";
import { createPayment, deletePayment, getPayment, listPayments, updatePayment } from "../controllers/payments.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, paymentCreateSchema, paymentUpdateSchema, paymentsQuerySchema } from "../schemas/domain.schemas";

export const paymentsRouter = Router();
paymentsRouter.get("/", validate(paymentsQuerySchema, "query"), asyncHandler(listPayments));
paymentsRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getPayment));
paymentsRouter.post("/", validate(paymentCreateSchema), asyncHandler(createPayment));
paymentsRouter.patch("/:id", validate(idSchema, "params"), validate(paymentUpdateSchema), asyncHandler(updatePayment));
paymentsRouter.delete("/:id", validate(idSchema, "params"), asyncHandler(deletePayment));
