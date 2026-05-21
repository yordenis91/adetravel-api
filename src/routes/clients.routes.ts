import { Router } from "express";
import { createClient, deleteClient, getClient, listClients, updateClient } from "../controllers/clients.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { clientsQuerySchema, idSchema } from "../schemas/domain.schemas";
import { roleMiddleware } from "../middlewares/role.middleware";

// ── IMPORTAMOS EL NUEVO VALIDADOR AVANZADO ──
import { createClientSchema, updateClientSchema } from "../validators/clients.validator";

export const clientsRouter = Router();

clientsRouter.get("/", validate(clientsQuerySchema, "query"), asyncHandler(listClients));
clientsRouter.get("/:id", validate(idSchema, "params"), asyncHandler(getClient));

// ── APLICAMOS EL NUEVO VALIDADOR A LAS RUTAS DE CREAR Y EDITAR ──
clientsRouter.post("/", validate(createClientSchema), asyncHandler(createClient));
clientsRouter.patch("/:id", validate(idSchema, "params"), validate(updateClientSchema), asyncHandler(updateClient));

// ── RUTA PROTEGIDA DE ELIMINACIÓN ──
clientsRouter.delete("/:id", validate(idSchema, "params"), roleMiddleware(["ADMINISTRADOR"]), asyncHandler(deleteClient));