import { statfs } from "node:fs/promises";
import { env } from "../config/env";
import { raiseOpsAlert } from "../services/ops-alert.service";

export interface DiskSpaceResult {
  path: string;
  freePercent: number;
  freeGb: number;
  totalGb: number;
  alerted: boolean;
}

const GB = 1024 ** 3;

/**
 * Comprueba el espacio libre del disco (el del servidor, visto desde el contenedor) y alerta si baja
 * de DISK_ALERT_MIN_FREE_PERCENT. Motivo: el 2026-10-07 el disco llegó al 100 %, falló una migración
 * y la demo quedó caída dos horas sin que nadie lo supiera.
 */
export async function runDiskSpaceJob(
  readStats: (path: string) => Promise<{ bavail: number | bigint; blocks: number | bigint; bsize: number | bigint }> = statfs
): Promise<DiskSpaceResult> {
  const stats = await readStats(env.DISK_CHECK_PATH);
  const bsize = Number(stats.bsize);
  const total = Number(stats.blocks) * bsize;
  const free = Number(stats.bavail) * bsize;
  const freePercent = total > 0 ? Math.round((free / total) * 1000) / 10 : 0;
  const result = {
    path: env.DISK_CHECK_PATH,
    freePercent,
    freeGb: Math.round((free / GB) * 10) / 10,
    totalGb: Math.round((total / GB) * 10) / 10,
    alerted: false,
  };
  if (freePercent < env.DISK_ALERT_MIN_FREE_PERCENT) {
    result.alerted = await raiseOpsAlert(
      "DISK_LOW",
      `Disco casi lleno: ${freePercent} % libre (${result.freeGb} GB de ${result.totalGb} GB)`,
      { ruta: result.path, libre_por_ciento: freePercent, libre_gb: result.freeGb, umbral_por_ciento: env.DISK_ALERT_MIN_FREE_PERCENT }
    );
  }
  return result;
}
