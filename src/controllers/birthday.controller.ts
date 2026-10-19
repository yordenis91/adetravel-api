import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/api-error";
import { sendItem } from "../utils/response";
import { renderBirthdayEmail, sendBirthdayGreetings } from "../services/birthday.service";

/** Vista previa de la felicitación de un cliente: plantilla activa (o diseño por defecto) con el saludo, editado o no. */
export async function previewBirthdayEmail(req: Request, res: Response): Promise<void> {
  const { clientId, message } = req.body as { clientId: string; message?: string };
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { firstName: true, lastName: true } });
  if (!client) throw new ApiError("Cliente no encontrado", 404, "CLIENT_NOT_FOUND");
  sendItem(res, await renderBirthdayEmail(client, message));
}

export async function sendBirthdayEmails(req: Request, res: Response): Promise<void> {
  const { clientIds, messages } = req.body as { clientIds: string[]; messages?: Record<string, string> };
  const results = await sendBirthdayGreetings(clientIds, messages);
  const sent = results.filter((r) => r.outcome === "sent").length;
  res.status(200).json({
    message: sent > 0 ? "Correos enviados exitosamente" : "No se envió ningún correo",
    sent,
    skipped: results.filter((r) => r.outcome === "already-sent" || r.outcome === "no-email" || r.outcome === "not-found").length,
    failed: results.filter((r) => r.outcome === "failed" || r.outcome === "not-delivered").length,
    results,
  });
}
