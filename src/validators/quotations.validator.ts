import { z } from "zod";

export const QUOTATION_STATUSES = ["BORRADOR", "ENVIADA", "ACEPTADA", "RECHAZADA"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const VALID_TRANSITIONS: Record<string, string[]> = {
  BORRADOR: ["ENVIADA", "RECHAZADA"],
  ENVIADA: ["ACEPTADA", "RECHAZADA", "BORRADOR"],
  ACEPTADA: [], 
  RECHAZADA: ["BORRADOR"]
};

export const quotationItemSchema = z.object({
  service: z.string().min(1, "El servicio es obligatorio"),
  description: z.string().optional(), // Eliminado el min(1) para permitir descripciones vacías
  quantity: z.number().int().min(1, "La cantidad mínima es 1"),
  unitPrice: z.number().min(0, "El precio no puede ser negativo"),
  total: z.number().min(0),
});

// Campos sin valores por defecto: son la base de ambos esquemas. Los defaults van solo en
// el de creación; si estuvieran aquí, `.partial()` los inyectaría en un PATCH parcial
// (zod 4 aplica el default aunque el campo falte) y editar solo `notes` dejaría
// IVA = 0, descuento = 0 y moneda = CLP, recalculando el total sin IVA.
const quotationFields = {
  requestId: z.string().min(1, "La solicitud es obligatoria"),
  serviceId: z.string().optional().nullable(),
  clientId: z.string().min(1, "El cliente es obligatorio"),
  validUntil: z.string().optional(), // Agregado para que no se borre la fecha
  currency: z.enum(["CLP", "USD"]),
  taxPercentage: z.number().min(0).max(100),
  discount: z.number().min(0),
  notes: z.string().max(2000).optional(),
  termsAndConditions: z.string().max(5000).optional(),
  items: z.array(quotationItemSchema).min(1, "Agrega al menos un ítem"),
};

export const createQuotationSchema = z.object({
  ...quotationFields,
  currency: quotationFields.currency.default("CLP"),
  taxPercentage: quotationFields.taxPercentage.default(0),
  discount: quotationFields.discount.default(0),
});

export const updateQuotationSchema = z.object(quotationFields).partial().refine(
  data => !data.items || data.items.length > 0,
  { message: "Debe haber al menos un ítem", path: ["items"] }
);

export const changeStatusSchema = z.object({
  status: z.enum(QUOTATION_STATUSES),
  notes: z.string().max(500).optional()
});

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;