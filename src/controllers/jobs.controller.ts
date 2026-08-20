import { Request, Response } from "express";
import { sendItem } from "../utils/response";
import { runOverdueNotificationsJob } from "../jobs/overdueNotifications.job";

/** Disparo manual del job de notificaciones por atraso — para pruebas/operación puntual. */
export async function runOverdueNotificationsNow(req: Request, res: Response): Promise<void> {
  const result = await runOverdueNotificationsJob();
  sendItem(res, result);
}
