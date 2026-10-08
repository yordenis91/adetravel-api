import { Router } from "express";
import { prisma } from "../lib/prisma";
import { sendItem } from "../utils/response";
import { asyncHandler } from "../utils/async-handler";

/** Rutas sin autenticación: los documentos legales los lee cualquiera con el link (login incluido). */
export const publicLegalRouter = Router();

const DOCUMENTS = {
  terms: { html: "termsOfServiceHtml", updatedAt: "termsOfServiceUpdatedAt" },
  privacy: { html: "privacyPolicyHtml", updatedAt: "privacyPolicyUpdatedAt" },
} as const;

publicLegalRouter.get("/:doc", asyncHandler(async (req, res) => {
  const doc = DOCUMENTS[req.params.doc as keyof typeof DOCUMENTS];
  if (!doc) {
    res.status(404).json({ message: "Documento no encontrado" });
    return;
  }
  const config = await prisma.systemConfig.findFirst({ select: { [doc.html]: true, [doc.updatedAt]: true } });
  // html null = la agencia no publicó texto propio; el cliente muestra el texto por defecto.
  sendItem(res, { html: (config as any)?.[doc.html] ?? null, updatedAt: (config as any)?.[doc.updatedAt] ?? null });
}));
