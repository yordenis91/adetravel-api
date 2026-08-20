import { z } from "zod";

// Esquema genérico para los 7 nomencladores (país, ciudad, región, nacionalidad,
// tipo/marca/modelo de auto). Todos comparten la misma forma { name, [parentField]? }.
export function catalogSchema(parentField?: string, parentRequired?: boolean) {
  const shape: Record<string, z.ZodTypeAny> = {
    name: z.string().min(1, "El nombre es obligatorio").max(200),
  };
  if (parentField) {
    shape[parentField] = parentRequired
      ? z.string().min(1, `${parentField} es obligatorio`)
      : z.string().optional();
  }
  return z.object(shape);
}

export const catalogQuerySchema = z.object({
  search: z.string().optional(),
  includeInactive: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
}).passthrough();
