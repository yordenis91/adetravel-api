import { Router } from "express";
import {
  createRequest, deleteRequest, getRequest, listRequests, updateRequest,
  getRequestQuotations, getRequestPayments, getRequestVouchers, // <- Tus rutas
  changeRequestStatus, duplicateRequest, getRequestStats        // <- Las nuevas
} from "../controllers/requests.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, requestsQuerySchema } from "../schemas/domain.schemas";
import { createRequestSchema, updateRequestSchema, changeStatusSchema } from "../validators/requests.validator";
import { roleMiddleware } from "../middlewares/role.middleware";

export const requestsRouter = Router();

requestsRouter.get("/stats", asyncHandler(getRequestStats)); 
requestsRouter.get("/", validate(requestsQuerySchema, "query"), asyncHandler(listRequests));
requestsRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getRequest));

// Tus rutas secundarias
requestsRouter.get("/:id/quotations", validate(idSchema, "params"), asyncHandler(getRequestQuotations));
requestsRouter.get("/:id/payments", validate(idSchema, "params"), asyncHandler(getRequestPayments));
requestsRouter.get("/:id/vouchers", validate(idSchema, "params"), asyncHandler(getRequestVouchers));

requestsRouter.post("/", validate(createRequestSchema), asyncHandler(createRequest));
requestsRouter.post("/:id/duplicate", validate(idSchema, "params"), asyncHandler(duplicateRequest));

requestsRouter.patch("/:id", validate(idSchema, "params"), validate(updateRequestSchema), asyncHandler(updateRequest));
requestsRouter.patch("/:id/status", validate(idSchema, "params"), validate(changeStatusSchema), asyncHandler(changeRequestStatus));

requestsRouter.delete("/:id", validate(idSchema, "params"), roleMiddleware(["ADMINISTRADOR"]), asyncHandler(deleteRequest));