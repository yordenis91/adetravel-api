import { Router } from "express";
import {
  createRequest, deleteRequest, getRequest, listRequests, updateRequest,
  getRequestQuotations, getRequestPayments, getRequestVouchers,
  changeRequestStatus, duplicateRequest, getRequestStats
} from "../controllers/requests.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, requestsQuerySchema } from "../schemas/domain.schemas";
import { createRequestSchema, updateRequestSchema, changeStatusSchema } from "../validators/requests.validator";
import { requirePermission } from "../middlewares/permission.middleware";

export const requestsRouter = Router();

requestsRouter.get("/stats", requirePermission("VIEW_REQUESTS"), asyncHandler(getRequestStats)); 
requestsRouter.get("/", requirePermission("VIEW_REQUESTS"), validate(requestsQuerySchema, "query"), asyncHandler(listRequests));
requestsRouter.get("/:id", requirePermission("VIEW_REQUESTS"), validate(idSchema, "params"), asyncHandler(getRequest));

requestsRouter.get("/:id/quotations", requirePermission("VIEW_REQUESTS"), validate(idSchema, "params"), asyncHandler(getRequestQuotations));
requestsRouter.get("/:id/payments", requirePermission("VIEW_REQUESTS"), validate(idSchema, "params"), asyncHandler(getRequestPayments));
requestsRouter.get("/:id/vouchers", requirePermission("VIEW_REQUESTS"), validate(idSchema, "params"), asyncHandler(getRequestVouchers));

requestsRouter.post("/", requirePermission("MANAGE_REQUESTS"), validate(createRequestSchema), asyncHandler(createRequest));
requestsRouter.post("/:id/duplicate", requirePermission("MANAGE_REQUESTS"), validate(idSchema, "params"), asyncHandler(duplicateRequest));

requestsRouter.patch("/:id", requirePermission("MANAGE_REQUESTS"), validate(idSchema, "params"), validate(updateRequestSchema), asyncHandler(updateRequest));
requestsRouter.patch("/:id/status", requirePermission("MANAGE_REQUESTS"), validate(idSchema, "params"), validate(changeStatusSchema), asyncHandler(changeRequestStatus));

// Eliminación estricta
requestsRouter.delete("/:id", requirePermission("DELETE_REQUEST"), validate(idSchema, "params"), asyncHandler(deleteRequest));