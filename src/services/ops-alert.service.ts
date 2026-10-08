import * as Sentry from "@sentry/node";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { escapeHtml } from "../utils/html";
import { sendEmail } from "./email.service";

/** Alertas de operación (fase 4 de preproducción). */
export type OpsAlertKind = "BACKUP_FAILED" | "DISK_LOW";

// Última alerta enviada por clave, para no repetir el mismo aviso en cada ejecución del cron.
const lastSentAt = new Map<string, number>();

export function resetOpsAlertState(): void {
  lastSentAt.clear();
}

/**
 * Registra la alerta en el log (nivel error) y en Sentry, y la envía por correo a ALERT_EMAIL.
 * Los detalles no deben llevar datos personales (son métricas y mensajes de error técnicos).
 * La misma clave no se repite antes de `repeatAfterMinutes`. Nunca lanza: una alerta que falla no
 * debe tumbar el trabajo que la origina.
 */
export async function raiseOpsAlert(
  kind: OpsAlertKind,
  summary: string,
  details: Record<string, unknown> = {},
  { repeatAfterMinutes = 360, now = Date.now() }: { repeatAfterMinutes?: number; now?: number } = {}
): Promise<boolean> {
  const last = lastSentAt.get(kind);
  if (last !== undefined && now - last < repeatAfterMinutes * 60_000) {
    logger.debug({ alert: kind }, "Alerta repetida omitida");
    return false;
  }
  lastSentAt.set(kind, now);

  logger.error({ alert: kind, ...details }, summary);
  Sentry.captureMessage(`[${kind}] ${summary}`, { level: "error", tags: { alert: kind }, extra: details });

  if (env.ALERT_EMAIL) {
    const rows = Object.entries(details)
      .map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(String(v))}</td></tr>`)
      .join("");
    try {
      await sendEmail({
        to: env.ALERT_EMAIL,
        subject: `[AdeTravel][alerta] ${summary}`,
        html: `<p>${escapeHtml(summary)}</p><table>${rows}</table><p>Entorno: ${escapeHtml(env.NODE_ENV)}. Ver OPERATIONS.md, sección "Alertas".</p>`,
      });
    } catch (err) {
      logger.error({ err, alert: kind }, "No se pudo enviar el correo de alerta");
    }
  }
  return true;
}

/** Ping al dead man's switch del backup: `<url>` si terminó bien, `<url>/fail` si falló. */
export async function pingBackupHeartbeat(ok: boolean, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!env.BACKUP_HEARTBEAT_URL) return;
  const url = ok ? env.BACKUP_HEARTBEAT_URL : `${env.BACKUP_HEARTBEAT_URL.replace(/\/+$/, "")}/fail`;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) logger.warn({ status: res.status }, "El heartbeat del backup respondió con error");
  } catch (err) {
    logger.warn({ err }, "No se pudo avisar al heartbeat del backup");
  }
}
