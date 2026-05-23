import { Router } from "express";
import { 
  createVoucher, deleteVoucher, getVoucher, listVouchers, 
  updateVoucher, changeVoucherStatus, getVoucherStats 
} from "../controllers/vouchers.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, vouchersQuerySchema } from "../schemas/domain.schemas";
import { createVoucherSchema, updateVoucherSchema, changeVoucherStatusSchema } from "../validators/vouchers.validator";
import { roleMiddleware } from "../middlewares/role.middleware";

export const vouchersRouter = Router();

vouchersRouter.get("/", validate(vouchersQuerySchema, "query"), asyncHandler(listVouchers));

// Endpoint de estadísticas (¡Debe ir ANTES que el /:id!)
vouchersRouter.get("/stats", asyncHandler(getVoucherStats));

vouchersRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getVoucher));

vouchersRouter.post("/", validate(createVoucherSchema), asyncHandler(createVoucher));
vouchersRouter.patch("/:id", validate(idSchema, "params"), validate(updateVoucherSchema), asyncHandler(updateVoucher));

// Endpoint dedicado al cambio de estados
vouchersRouter.patch("/:id/status", validate(idSchema, "params"), validate(changeVoucherStatusSchema), asyncHandler(changeVoucherStatus));

vouchersRouter.delete("/:id", validate(idSchema, "params"), roleMiddleware(["ADMINISTRADOR"]), asyncHandler(deleteVoucher));