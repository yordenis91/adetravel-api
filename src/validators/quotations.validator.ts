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
  notes: z.string().max(500).optional(),
  /** false = cambiar el estado sin enviar el correo automático (p. ej. la cotización se envió por WhatsApp). */
  sendEmail: z.boolean().default(true)
});

/** Máximo de destinatarios por envío: evita usar el sistema para difundir. */
export const MAX_QUOTATION_RECIPIENTS = 10;

/** Cuerpo de POST /quotations/:id/send: destinatarios, asunto y mensaje que la persona revisó y editó. */
export const sendQuotationEmailSchema = z.object({
  to: z.array(z.string().trim().email("Correo inválido").max(254)).min(1, "Indica al menos un destinatario").max(MAX_QUOTATION_RECIPIENTS, `Máximo ${MAX_QUOTATION_RECIPIENTS} destinatarios`),
  // Sin saltos de línea: el asunto va a una cabecera del correo.
  subject: z.string().trim().min(1, "El asunto es obligatorio").max(200).regex(/^[^\r\n]+$/, "El asunto no puede tener saltos de línea"),
  message: z.string().trim().min(1, "El mensaje es obligatorio").max(5000, "El mensaje es demasiado largo (máximo 5000 caracteres)"),
});

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type SendQuotationEmailInput = z.infer<typeof sendQuotationEmailSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;