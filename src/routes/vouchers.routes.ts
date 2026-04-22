import { Router } from "express";
import { createVoucher, deleteVoucher, getVoucher, listVouchers, updateVoucher } from "../controllers/vouchers.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, voucherCreateSchema, voucherUpdateSchema, vouchersQuerySchema } from "../schemas/domain.schemas";

export const vouchersRouter = Router();
vouchersRouter.get("/", validate(vouchersQuerySchema, "query"), asyncHandler(listVouchers));
vouchersRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getVoucher));
vouchersRouter.post("/", validate(voucherCreateSchema), asyncHandler(createVoucher));
vouchersRouter.patch("/:id", validate(idSchema, "params"), validate(voucherUpdateSchema), asyncHandler(updateVoucher));
vouchersRouter.delete("/:id", validate(idSchema, "params"), asyncHandler(deleteVoucher));
