import { z } from "zod";

export const taskSchema = z.object({
  title: z.string().min(1, "El título es obligatorio"),
  description: z.string().optional().nullable(),
  dueDate: z.string().min(10, "La fecha es obligatoria"),
  priority: z.enum(["ALTA", "MEDIA", "BAJA"]),
  status: z.enum(["PENDIENTE", "COMPLETADA"]).optional(),
  relatedEntityType: z.string().optional().nullable(),
  relatedEntityId: z.string().optional().nullable(),
  relatedEntityLabel: z.string().optional().nullable(),
});

export const updateTaskSchema = taskSchema.partial();