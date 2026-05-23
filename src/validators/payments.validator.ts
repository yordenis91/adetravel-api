import { z } from "zod";

export const PAYMENT_STATUSES = ["PENDIENTE", "COMPLETADO", "CANCELADO"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "CHEQUE", "WEBPAY"] as const;

export const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDIENTE: ["COMPLETADO", "CANCELADO"],
  COMPLETADO: ["CANCELADO"], // Permite cancelar en caso de reversa/devolución
  CANCELADO: ["PENDIENTE"], // Permite reabrir un pago por error
};

const basePaymentSchema = z.object({
  requestId: z.string().min(1, "La solicitud es obligatoria"),
  quotationId: z.string().optional().nullable(),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  currency: z.enum(["CLP", "USD"]).default("CLP"),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido (YYYY-MM-DD)").optional(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const createPaymentSchema = basePaymentSchema;
export const updatePaymentSchema = basePaymentSchema.partial();
export const changePaymentStatusSchema = z.object({
  status: z.enum(PAYMENT_STATUSES),
  notes: z.string().max(500).optional()
});