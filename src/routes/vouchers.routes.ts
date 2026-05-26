import { Router } from "express";
import { 
  createVoucher, deleteVoucher, getVoucher, listVouchers, 
  updateVoucher, changeVoucherStatus, getVoucherStats 
} from "../controllers/vouchers.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, vouchersQuerySchema } from "../schemas/domain.schemas";
import { createVoucherSchema, updateVoucherSchema, changeVoucherStatusSchema } from "../validators/vouchers.validator";
// 🔥 CAMBIO: Usamos el nuevo middleware RBAC
import { requirePermission } from "../middlewares/permission.middleware";

export const vouchersRouter = Router();

vouchersRouter.get("/", requirePermission("VIEW_VOUCHERS"), validate(vouchersQuerySchema, "query"), asyncHandler(listVouchers));

// Endpoint de estadísticas (¡Debe ir ANTES que el /:id!)
vouchersRouter.get("/stats", requirePermission("VIEW_VOUCHERS"), asyncHandler(getVoucherStats));

vouchersRouter.get("/:id", requirePermission("VIEW_VOUCHERS"), validate(idSchema, "params"), asyncHandler(getVoucher));

vouchersRouter.post("/", requirePermission("MANAGE_VOUCHERS"), validate(createVoucherSchema), asyncHandler(createVoucher));
vouchersRouter.patch("/:id", requirePermission("MANAGE_VOUCHERS"), validate(idSchema, "params"), validate(updateVoucherSchema), asyncHandler(updateVoucher));

// Endpoint dedicado al cambio de estados
vouchersRouter.patch("/:id/status", requirePermission("MANAGE_VOUCHERS"), validate(idSchema, "params"), validate(changeVoucherStatusSchema), asyncHandler(changeVoucherStatus));

// Eliminación estricta
vouchersRouter.delete("/:id", requirePermission("DELETE_VOUCHER"), validate(idSchema, "params"), asyncHandler(deleteVoucher));