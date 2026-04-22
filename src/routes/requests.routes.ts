import { Router } from "express";
import {
  createRequest,
  deleteRequest,
  getRequest,
  getRequestPayments,
  getRequestQuotations,
  getRequestVouchers,
  listRequests,
  updateRequest
} from "../controllers/requests.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, requestCreateSchema, requestUpdateSchema, requestsQuerySchema } from "../schemas/domain.schemas";

export const requestsRouter = Router();
requestsRouter.get("/", validate(requestsQuerySchema, "query"), asyncHandler(listRequests));
requestsRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getRequest));
requestsRouter.get("/:id/quotations", validate(idSchema, "params"), asyncHandler(getRequestQuotations));
requestsRouter.get("/:id/payments", validate(idSchema, "params"), asyncHandler(getRequestPayments));
requestsRouter.get("/:id/vouchers", validate(idSchema, "params"), asyncHandler(getRequestVouchers));
requestsRouter.post("/", validate(requestCreateSchema), asyncHandler(createRequest));
requestsRouter.patch("/:id", validate(idSchema, "params"), validate(requestUpdateSchema), asyncHandler(updateRequest));
requestsRouter.delete("/:id", validate(idSchema, "params"), asyncHandler(deleteRequest));
