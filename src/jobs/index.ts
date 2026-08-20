import cron from "node-cron";
import { logger } from "../utils/logger";
import { runOverdueNotificationsJob } from "./overdueNotifications.job";

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

  logger.info("[jobs] Cron jobs registrados");
}
