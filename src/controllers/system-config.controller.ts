import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem } from "../utils/response";
import { createActivityLog } from "../services/activity-log.service";
import { encryptPII } from "../lib/pii-encryption";
import { syncExchangeRates } from "../services/exchange-rate.service";
import { sanitizeLegalHtml } from "../utils/sanitize-legal-html";

/**
 * La contraseña del SMTP nunca sale de la API: se guarda cifrada (misma clave que la PII de
 * clientes) y las respuestas solo dicen si hay una configurada. El Dashboard pide esta
 * configuración para las tasas de cambio, así que antes la contraseña viajaba al navegador.
 */
export function toPublicConfig<T extends { smtpPassword?: string | null }>(config: T | null) {
  if (!config) return {};
  const { smtpPassword, ...rest } = config;
  return { ...rest, smtpPasswordSet: !!smtpPassword };
}

/**
 * Normaliza la contraseña recibida: vacía o ausente = conservar la actual (la UI no la conoce);
 * null = borrarla; texto = guardarla cifrada.
 */
export function smtpPasswordUpdate(body: Record<string, unknown>): { set: boolean; value?: string | null } {
  if (!("smtpPassword" in body)) return { set: false };
  const value = body.smtpPassword;
  if (value === null) return { set: true, value: null };
  if (typeof value !== "string" || value === "") return { set: false };
  return { set: true, value: encryptPII(value) };
}

export async function getSystemConfig(_req: Request, res: Response): Promise<void> {
  const config = await prisma.systemConfig.findFirst();
  sendItem(res, toPublicConfig(config));
}

/**
 * Sanea el HTML de un documento legal (se publica sin login) y, si el contenido cambió,
 * sella la fecha de actualización en el servidor. Vacío = volver al texto por defecto.
 * Si el cliente no envía el campo, no se toca.
 */
function applyLegalDocument(
  data: Record<string, unknown>,
  existing: Record<string, any> | null,
  htmlKey: string,
  dateKey: string
): void {
  if (!(htmlKey in data)) return;
  const html = sanitizeLegalHtml(data[htmlKey]);
  data[htmlKey] = html;
  if (html !== (existing?.[htmlKey] ?? null)) data[dateKey] = html ? new Date() : null;
}

export async function upsertSystemConfig(req: Request, res: Response): Promise<void> {
  const existing = await prisma.systemConfig.findFirst();
  // Los campos exchangeLast* los escribe solo el servidor: el cliente reenvía la config que leyó
  // y, si aplicara esos valores, pisaría una sincronización ocurrida mientras tenía la pantalla abierta.
  const {
    smtpPassword: _ignored, smtpPasswordSet: _readOnly,
    exchangeLastAttemptAt: _a, exchangeLastSyncAt: _b, exchangeLastSyncError: _c,
    termsOfServiceUpdatedAt: _d, privacyPolicyUpdatedAt: _e,
    ...data
  } = req.body as Record<string, unknown>;
  applyLegalDocument(data, existing, "termsOfServiceHtml", "termsOfServiceUpdatedAt");
  applyLegalDocument(data, existing, "privacyPolicyHtml", "privacyPolicyUpdatedAt");
  const password = smtpPasswordUpdate(req.body as Record<string, unknown>);
  if (password.set) data.smtpPassword = password.value;
  const config = existing
    ? await prisma.systemConfig.update({ where: { id: existing.id }, data: data as any })
    : await prisma.systemConfig.create({ data: data as any });

  await createActivityLog({
    action: existing ? "UPDATE" : "CREATE",
    entityType: "SystemConfig",
    entityId: config.id,
    entityLabel: config.agencyName ?? "System Config",
    performedBy: req.user?.id
  });

  sendItem(res, toPublicConfig(config));
}

export async function syncExchangeRatesHandler(req: Request, res: Response): Promise<void> {
  const result = await syncExchangeRates("manual", req.user?.id);
  switch (result.status) {
    case "synced": {
      const config = await prisma.systemConfig.findFirst();
      sendItem(res, toPublicConfig(config));
      return;
    }
    case "failed":
      res.status(502).json({ message: result.message });
      return;
    case "skipped":
      if (result.reason === "cooldown") {
        res.status(429).json({ message: `Las tasas se actualizaron hace poco. Para cuidar tu cuota de la API, vuelve a intentarlo en ${result.retryAfterMinutes} min.` });
      } else if (result.reason === "no-api-key") {
        res.status(500).json({ message: "La API Key de CurrencyAPI no está configurada." });
      } else if (result.reason === "no-rates") {
        res.status(400).json({ message: "No hay tasas configuradas para actualizar." });
      } else {
        res.status(409).json({ message: "Ya hay una sincronización en curso." });
      }
      return;
  }
}
