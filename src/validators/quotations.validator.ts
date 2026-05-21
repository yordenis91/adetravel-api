import { z } from "zod";

export const QUOTATION_STATUSES = ["BORRADOR", "ENVIADA", "ACEPTADA", "RECHAZADA"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

// Mapa estricto de transiciones
export const VALID_TRANSITIONS: Record<string, string[]> = {
  BORRADOR: ["ENVIADA", "RECHAZADA"],
  ENVIADA:  ["ACEPTADA", "RECHAZADA", "BORRADOR"], // Volver a borrador si hay que corregir
  ACEPTADA: [], // Estado final de éxito
  RECHAZADA: ["BORRADOR"] // Reabrir para re-cotizar
};

export const createQuotationSchema = z.object({
  requestId: z.string().min(1, "La solicitud es obligatoria"),
  clientId: z.string().min(1, "El cliente es obligatorio"),
  total: z.coerce.number().min(0, "El total no puede ser negativo"),
  currency: z.string().length(3).default("CLP"), // CLP, USD, EUR
  validUntil: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes: z.string().max(2000).optional(),
  terms: z.string().max(2000).optional(),
  // Si tienes items en tu base de datos:
  // items: z.array(z.object({ description: z.string(), price: z.number(), quantity: z.number() })).optional()
});

export const updateQuotationSchema = createQuotationSchema.partial();

export const changeStatusSchema = z.object({
  status: z.enum(QUOTATION_STATUSES),
  notes: z.string().max(500).optional()
});

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type ChangeQuotationStatusInput = z.infer<typeof changeStatusSchema>;