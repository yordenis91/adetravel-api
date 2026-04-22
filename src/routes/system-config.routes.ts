import { Router } from "express";
import { getSystemConfig, upsertSystemConfig } from "../controllers/system-config.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { systemConfigUpsertSchema } from "../schemas/domain.schemas";

export const systemConfigRouter = Router();
systemConfigRouter.get("/", asyncHandler(getSystemConfig));
systemConfigRouter.put("/", validate(systemConfigUpsertSchema), asyncHandler(upsertSystemConfig));
