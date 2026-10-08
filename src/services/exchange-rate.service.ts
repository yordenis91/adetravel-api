import axios from "axios";
import https from "https";
import { prisma } from "../lib/prisma";
import { logger } from "../utils/logger";
import { createActivityLog } from "./activity-log.service";

/** Límites del intervalo configurable. Mínimo 15 min (planes pagos de la API); máximo 7 días. */
export const MIN_SYNC_INTERVAL_MINUTES = 15;
export const MAX_SYNC_INTERVAL_MINUTES = 7 * 24 * 60;
/** 3 veces al día. */
export const DEFAULT_SYNC_INTERVAL_MINUTES = 480;
/** Tras un intento fallido se reintenta como pronto a esta espera, sin importar el intervalo. */
const FAILURE_RETRY_MINUTES = 30;

export type SyncTrigger = "manual" | "auto";

export type SyncResult =
  | { status: "synced"; updated: number }
  | { status: "skipped"; reason: "no-api-key" | "no-rates" | "not-due" | "cooldown" | "in-progress"; retryAfterMinutes?: number }
  | { status: "failed"; message: string };

let running = false;

const minutesSince = (date: Date | null | undefined, now: Date) =>
  date ? (now.getTime() - date.getTime()) / 60_000 : Infinity;

/** Si toca sincronizar de forma automática (pura, para poder probarla sin base ni reloj). */
export function isAutoSyncDue(
  config: { exchangeAutoSync: boolean; exchangeSyncIntervalMinutes: number; exchangeLastAttemptAt: Date | null; exchangeLastSyncAt: Date | null },
  now: Date
): boolean {
  if (!config.exchangeAutoSync) return false;
  const interval = Math.max(config.exchangeSyncIntervalMinutes, MIN_SYNC_INTERVAL_MINUTES);
  // El último intento fallido no cuenta como éxito, pero tampoco se reintenta en cada tick.
  const lastAttemptFailed = !!config.exchangeLastAttemptAt && (!config.exchangeLastSyncAt || config.exchangeLastAttemptAt > config.exchangeLastSyncAt);
  const wait = lastAttemptFailed ? Math.min(interval, FAILURE_RETRY_MINUTES) : interval;
  return minutesSince(config.exchangeLastAttemptAt, now) >= wait;
}

/** Espera mínima entre sincronizaciones manuales: la mitad del intervalo (4 h con el valor por defecto). */
export function manualCooldownMinutes(intervalMinutes: number): number {
  return Math.max(Math.floor(intervalMinutes / 2), 5);
}

/**
 * Consulta la API de divisas y actualiza las tasas guardadas. La usan el botón "Sincronizar API"
 * (manual) y el job programado (auto). Registra el intento en SystemConfig para que la UI muestre
 * cuándo fue la última vez y por qué falló.
 */
export async function syncExchangeRates(trigger: SyncTrigger, performedBy?: string): Promise<SyncResult> {
  if (running) return { status: "skipped", reason: "in-progress" };
  running = true;
  try {
    const config = await prisma.systemConfig.findFirst();
    if (!config?.exchangeRates) return { status: "skipped", reason: "no-rates" };

    const now = new Date();
    if (trigger === "auto" && !isAutoSyncDue(config, now)) return { status: "skipped", reason: "not-due" };
    if (trigger === "manual") {
      const cooldown = manualCooldownMinutes(config.exchangeSyncIntervalMinutes);
      const elapsed = minutesSince(config.exchangeLastSyncAt, now);
      if (elapsed < cooldown) return { status: "skipped", reason: "cooldown", retryAfterMinutes: Math.ceil(cooldown - elapsed) };
    }

    const apiKey = process.env.CURRENCY_API_KEY;
    if (!apiKey) return { status: "skipped", reason: "no-api-key" };

    // Se marca el intento antes de llamar: así un fallo (o un reinicio a mitad de camino) no provoca reintentos en ráfaga.
    await prisma.systemConfig.update({ where: { id: config.id }, data: { exchangeLastAttemptAt: now } });

    try {
      const response = await axios.get("https://currencyapi.net/api/v2/rates", {
        params: { key: apiKey, base: "USD", output: "JSON" },
        timeout: 10000,
        httpsAgent: new https.Agent({ family: 4 })
      });
      const apiRates = response.data?.rates;
      if (!apiRates) throw new Error("La API de divisas respondió con un formato desconocido.");

      // Se relee justo antes de guardar: el usuario pudo editar tasas mientras esperábamos a la API.
      const fresh = await prisma.systemConfig.findFirst({ where: { id: config.id } });
      const current: any[] = JSON.parse(fresh?.exchangeRates ?? config.exchangeRates);
      let updated = 0;
      const stamp = new Date().toISOString();
      const next = current.map((rate) => {
        const fromUsd = apiRates[rate.fromCurrency];
        const toUsd = apiRates[rate.toCurrency];
        if (!fromUsd || !toUsd) return rate;
        updated++;
        return { ...rate, rate: toUsd / fromUsd, lastUpdated: stamp };
      });

      await prisma.systemConfig.update({
        where: { id: config.id },
        data: { exchangeRates: JSON.stringify(next), exchangeLastSyncAt: new Date(), exchangeLastSyncError: null }
      });
      await createActivityLog({
        action: "SYNC_API",
        entityType: "SystemConfig",
        entityId: config.id,
        entityLabel: trigger === "auto" ? "Sincronización automática de divisas" : "Sincronización de divisas exitosa",
        performedBy
      });
      return { status: "synced", updated };
    } catch (error: any) {
      // Sin error.response.data completo: puede incluir la clave de la API de divisas en la URL.
      logger.error({ err: error?.message, status: error?.response?.status }, "Error de sincronización de divisas");
      const message = error?.response?.status
        ? `El proveedor de divisas respondió con error ${error.response.status}.`
        : "No se pudo conectar con el proveedor de divisas.";
      await prisma.systemConfig.update({ where: { id: config.id }, data: { exchangeLastSyncError: message } }).catch(() => undefined);
      return { status: "failed", message };
    }
  } finally {
    running = false;
  }
}
