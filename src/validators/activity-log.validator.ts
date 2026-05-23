import { z } from "zod";

export const listActivityLogSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  search: z.string().optional(),
  performedBy: z.string().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido (YYYY-MM-DD)").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido (YYYY-MM-DD)").optional(),
});

export const statsActivityLogSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

export const purgeActivityLogSchema = z.object({
  days: z.coerce.number().int().min(30, "No puedes borrar logs con menos de 30 días").optional().default(90),
});