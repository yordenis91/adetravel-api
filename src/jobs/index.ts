import cron from "node-cron";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { runOverdueNotificationsJob } from "./overdueNotifications.job";
import { runDatabaseBackupJob, backupsEnabled } from "./backupDatabase.job";

/**
 * Registra los cron jobs del sistema. Se llama una vez al arrancar el servidor (ver server.ts).
 * Requiere `node-cron` — ejecutar `npm install` antes de levantar el servidor si el paquete
 * todavía no está en node_modules.
 */
export function registerJobs(): void {
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
        .then((result) => logger.info({ result }, "[jobs] backupDatabase ejecutado"))
        .catch((error) => logger.error({ error }, "[jobs] backupDatabase falló"));
    });
    logger.info({ cron: env.BACKUP_CRON }, "[jobs] Backup de base de datos programado");
  } else {
    logger.warn("[jobs] Backup de base de datos deshabilitado: faltan variables BACKUP_S3_*");
  }

  logger.info("[jobs] Cron jobs registrados");
}
