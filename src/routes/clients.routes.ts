import { Router } from "express";
import { createClient, deleteClient, getClient, listClients, updateClient, toggleClientActive } from "../controllers/clients.controller";
import { sendBirthdayEmails } from "../controllers/birthday.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { clientsQuerySchema, idSchema } from "../schemas/domain.schemas";
// 🔥 CAMBIO: Usamos nuestro nuevo guardia de permisos
import { requirePermission } from "../middlewares/permission.middleware";
import { createClientSchema, updateClientSchema } from "../validators/clients.validator";

export const clientsRouter = Router();

// Todos los que tengan permiso para ver clientes pueden listarlos
clientsRouter.get("/", requirePermission("VIEW_CLIENTS"), validate(clientsQuerySchema, "query"), asyncHandler(listClients));
clientsRouter.get("/:id", requirePermission("VIEW_CLIENTS"), validate(idSchema, "params"), asyncHandler(getClient));

// Solo quienes tengan permiso pueden crear o editar
clientsRouter.post("/", requirePermission("CREATE_CLIENT"), validate(createClientSchema), asyncHandler(createClient));
clientsRouter.patch("/:id", requirePermission("CREATE_CLIENT"), validate(idSchema, "params"), validate(updateClientSchema), asyncHandler(updateClient));
clientsRouter.patch("/:id/toggle", requirePermission("CREATE_CLIENT"), validate(idSchema, "params"), asyncHandler(toggleClientActive));

// Ruta protegida de eliminación estricta
clientsRouter.delete("/:id", requirePermission("DELETE_CLIENT"), validate(idSchema, "params"), asyncHandler(deleteClient));

// Envío de felicitaciones de cumpleaños (individual o masivo)
clientsRouter.post("/birthday", requirePermission("SEND_BIRTHDAY_EMAILS"), asyncHandler(sendBirthdayEmails));