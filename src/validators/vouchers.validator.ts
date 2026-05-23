import { z } from "zod";

export const VOUCHER_STATUSES = ["BORRADOR", "EMITIDO", "CANCELADO"] as const;
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

export const SERVICE_TYPES = ["HOTEL", "AÉREO", "TOUR", "TRANSFER", "SEGURO", "RESTAURANT", "OTRO"] as const;

export const VALID_TRANSITIONS: Record<string, string[]> = {
  BORRADOR: ["EMITIDO", "CANCELADO"],
  EMITIDO: ["BORRADOR", "CANCELADO"], // Permite volver a borrador si hay un error
  CANCELADO: ["BORRADOR"], // Única forma de revivir un voucher cancelado
};

// 1. Definimos el objeto puro SIN el refine
const voucherObjectSchema = z.object({
  requestId: z.string().min(1, "La solicitud es obligatoria"),
  providerId: z.string().optional().nullable(),
  serviceType: z.enum(SERVICE_TYPES).optional().nullable(),
  serviceName: z.string().max(200).optional().nullable(),
  serviceDetails: z.string().max(2000).optional().nullable(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido (YYYY-MM-DD)").optional().nullable(),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido (YYYY-MM-DD)").optional().nullable(),
  destination: z.string().max(200).optional().nullable(),
  passengerNames: z.array(z.string()).optional().nullable(),
  confirmationCode: z.string().max(50).optional().nullable(),
  amount: z.coerce.number().min(0).optional().nullable(),
  currency: z.enum(["CLP", "USD"]).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// 2. Extraemos la lógica de validación de fechas
const dateRefinement = (data: any) => {
  if (data.checkIn && data.checkOut) {
    return new Date(data.checkOut) >= new Date(data.checkIn);
  }
  return true;
};

// 3. Aplicamos el refine por separado a la creación y a la actualización (partial)
export const createVoucherSchema = voucherObjectSchema.refine(
  dateRefinement,
  { message: "La fecha de fin (checkOut) debe ser posterior a la de inicio (checkIn)", path: ["checkOut"] }
);

export const updateVoucherSchema = voucherObjectSchema.partial().refine(
  dateRefinement,
  { message: "La fecha de fin (checkOut) debe ser posterior a la de inicio (checkIn)", path: ["checkOut"] }
);

export const changeVoucherStatusSchema = z.object({
  status: z.enum(VOUCHER_STATUSES),
  notes: z.string().max(500).optional()
});