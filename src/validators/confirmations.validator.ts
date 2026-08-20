import { z } from "zod";

// Regla de negocio #10/sección 4.12: la Confirmación trae el número de confirmación propio
// del proveedor, el precio final, la vigencia y (opcionalmente) el tipo de cambio.
const baseConfirmationSchema = z.object({
  requestId: z.string().min(1, "La solicitud es obligatoria"),
  serviceId: z.string().optional().nullable(), // null cuando la Solicitud es Paquete (isPackage=true)
  providerId: z.string().min(1, "El proveedor es obligatorio"),
  providerConfirmationNumber: z.string().max(100).optional().nullable(),
  price: z.coerce.number().min(0, "El precio no puede ser negativo"),
  validUntil: z.string().optional().nullable(),
  exchangeRate: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const createConfirmationSchema = baseConfirmationSchema;
export const updateConfirmationSchema = baseConfirmationSchema.partial();

export type CreateConfirmationInput = z.infer<typeof createConfirmationSchema>;
export type UpdateConfirmationInput = z.infer<typeof updateConfirmationSchema>;
