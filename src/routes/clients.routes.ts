import { Router } from "express";
import { createClient, deleteClient, getClient, listClients, updateClient } from "../controllers/clients.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { clientCreateSchema, clientUpdateSchema, clientsQuerySchema, idSchema } from "../schemas/domain.schemas";

export const clientsRouter = Router();
clientsRouter.get("/", validate(clientsQuerySchema, "query"), asyncHandler(listClients));
clientsRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getClient));
clientsRouter.post("/", validate(clientCreateSchema), asyncHandler(createClient));
clientsRouter.patch("/:id", validate(idSchema, "params"), validate(clientUpdateSchema), asyncHandler(updateClient));
clientsRouter.delete("/:id", validate(idSchema, "params"), asyncHandler(deleteClient));
