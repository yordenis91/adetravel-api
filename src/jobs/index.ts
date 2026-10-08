import cron from "node-cron";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { runOverdueNotificationsJob } from "./overdueNotifications.job";
import { runDatabaseBackupJob, backupsEnabled } from "./backupDatabase.job";
import { runDiskSpaceJob } from "./diskSpace.job";
import { pingBackupHeartbeat, raiseOpsAlert } from "../services/ops-alert.service";

/**
 * Registra los cron jobs del sistema. Se llama una vez al arrancar el servidor (ver server.ts).
 * Requiere `node-cron` — ejecutar `npm install` antes de levantar el servidor si el paquete
 * todavía no está en node_modules.
 */
export function registerJobs(): void {
  // Con varias réplicas, cada una ejecutaría los trabajos (backups y avisos duplicados): solo una
  // debe tener JOBS_ENABLED=true. Ver OPERATIONS.md, "Réplicas y trabajos programados".
  if (!env.JOBS_ENABLED) {
    logger.warn("[jobs] Trabajos programados desactivados en esta réplica (JOBS_ENABLED=false)");
    return;
  }

  // Notificaciones automáticas de atraso (sección 6.12 del documento), una vez al día a las 9am.
  cron.schedule("0 9 * * *", () => {
    runOverdueNotificationsJob()
      .then((result) => logger.info({ result }, "[jobs] overdueNotifications ejecutado"))
      .catch((error) => logger.error({ error }, "[jobs] overdueNotifications falló"));
  });

  // Backup de la base a S3 (ver OPERATIONS.md). Se registra solo si las
  // variables BACKUP_S3_* están configuradas — sin ellas, no tiene sentido
  // programar un cron que va a fallar cada vez que corra.
  if (backupsEnabled()) {
    cron.schedule(env.BACKUP_CRON, () => {
      runDatabaseBackupJob()
        .then(async (result) => {
          logger.info({ result }, "[jobs] backupDatabase ejecutado");
          await pingBackupHeartbeat(true);
        })
        .catch(async (error) => {
          // Cada fallo se avisa (repeatAfterMinutes 0): con un backup diario, un aviso perdido es un día sin copia.
          await raiseOpsAlert("BACKUP_FAILED", "El backup de la base de datos falló", { error: (error as Error)?.message ?? String(error) }, { repeatAfterMinutes: 0 });
          await pingBackupHeartbeat(false);
        });
    });
    logger.info({ cron: env.BACKUP_CRON }, "[jobs] Backup de base de datos programado");
  } else {
    logger.warn("[jobs] Backup de base de datos deshabilitado: faltan variables BACKUP_S3_*");
  }

  // Espacio en disco al arrancar (cada despliegue) y cada 30 minutos (DISK_CHECK_CRON); la alerta se
  // repite como mucho cada 6 horas.
  const checkDisk = () =>
    runDiskSpaceJob()
      .then((result) => logger.info({ result }, "[jobs] diskSpace ejecutado"))
      .catch((error) => logger.error({ error }, "[jobs] diskSpace falló"));
  cron.schedule(env.DISK_CHECK_CRON, checkDisk);
  void checkDisk();

  logger.info("[jobs] Cron jobs registrados");
}
