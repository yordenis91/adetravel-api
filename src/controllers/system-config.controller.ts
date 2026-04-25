import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem } from "../utils/response";
import { createActivityLog } from "../services/activity-log.service";

export async function getSystemConfig(_req: Request, res: Response): Promise<void> {
  const config = await prisma.systemConfig.findFirst();
  sendItem(res, config ?? {});
}

export async function upsertSystemConfig(req: Request, res: Response): Promise<void> {
  const existing = await prisma.systemConfig.findFirst();
  const config = existing
    ? await prisma.systemConfig.update({ where: { id: existing.id }, data: req.body as any })
    : await prisma.systemConfig.create({ data: req.body as any });

  await createActivityLog({
    action: existing ? "UPDATE" : "CREATE",
    entityType: "SystemConfig",
    entityId: config.id,
    entityLabel: config.agencyName ?? "System Config",
    performedBy: req.user?.id
  });

  sendItem(res, config);
}
