import { Router } from "express";
import { createProvider, deleteProvider, getProvider, listProviders, updateProvider } from "../controllers/providers.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { idSchema, providerCreateSchema, providerUpdateSchema, providersQuerySchema } from "../schemas/domain.schemas";

export const providersRouter = Router();
providersRouter.get("/", validate(providersQuerySchema, "query"), asyncHandler(listProviders));
providersRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getProvider));
providersRouter.post("/", validate(providerCreateSchema), asyncHandler(createProvider));
providersRouter.patch("/:id", validate(idSchema, "params"), validate(providerUpdateSchema), asyncHandler(updateProvider));
providersRouter.delete("/:id", validate(idSchema, "params"), asyncHandler(deleteProvider));
