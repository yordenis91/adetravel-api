import { Router } from "express";
import {
  getPaymentsByMonth,
  getQuotationsByStatus,
  getRequestsByMonth,
  getStats
} from "../controllers/reports.controller";
import { asyncHandler } from "../utils/async-handler";

export const reportsRouter = Router();
reportsRouter.get("/stats", asyncHandler(getStats));
reportsRouter.get("/requests-by-month", asyncHandler(getRequestsByMonth));
reportsRouter.get("/payments-by-month", asyncHandler(getPaymentsByMonth));
reportsRouter.get("/quotations-by-status", asyncHandler(getQuotationsByStatus));
