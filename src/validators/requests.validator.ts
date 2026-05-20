import { z } from "zod";

export const SERVICE_TYPES = [
  "HOTEL",
  "AEREO",
  "TOUR",
  "TRANSFER",
  "SEGURO",
  "RENT_A_CAR",
  "CRUCERO",
  "OTRO"
] as const;

export const REQUEST_STATUSES = [
  "Recepcionada",
  "Cotizada",
  "Confirmada",
  "Vendida",
  "Cancelada"
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  Recepcionada: ["Cotizada", "Cancelada"],
  Cotizada: ["Confirmada", "Cancelada", "Recepcionada"],
  Confirmada: ["Vendida", "Cancelada"],
  Vendida: [],
  Cancelada: ["Recepcionada"]
};

export const createRequestSchema = z
  .object({
    clientId: z.string().min(1, "El cliente es obligatorio"),
    isPackage: z.boolean().default(false),
    requestDate: z.string().datetime().optional(),
    originCountry: z.string().max(100).optional(),
    originCity: z.string().max(100).optional(),
    destinationCountry: z.string().min(1, "El pais de destino es obligatorio").max(100),
    destinationCity: z.string().min(1, "La ciudad de destino es obligatoria").max(100),
    durationDays: z.number().int().min(1).max(365).optional(),
    budgetMin: z.number().min(0).optional(),
    budgetMax: z.number().min(0).optional(),
    description: z.string().max(2000).optional(),
    services: z.array(z.enum(SERVICE_TYPES)).default([])
  })
  .refine(
    (data) => {
      if (data.budgetMin !== undefined && data.budgetMax !== undefined) {
        return data.budgetMax >= data.budgetMin;
      }
      return true;
    },
    {
      message: "El presupuesto maximo debe ser mayor o igual al minimo",
      path: ["budgetMax"]
    }
  );

export const updateRequestSchema = z
  .object({
    isPackage: z.boolean().optional(),
    requestDate: z.string().datetime().optional(),
    originCountry: z.string().max(100).optional(),
    originCity: z.string().max(100).optional(),
    destinationCountry: z.string().max(100).optional(),
    destinationCity: z.string().max(100).optional(),
    durationDays: z.number().int().min(1).max(365).optional(),
    budgetMin: z.number().min(0).optional(),
    budgetMax: z.number().min(0).optional(),
    description: z.string().max(2000).optional(),
    services: z.array(z.enum(SERVICE_TYPES)).optional()
  })
  .refine(
    (data) => {
      if (data.budgetMin !== undefined && data.budgetMax !== undefined) {
        return data.budgetMax >= data.budgetMin;
      }
      return true;
    },
    {
      message: "El presupuesto maximo debe ser mayor o igual al minimo",
      path: ["budgetMax"]
    }
  );

export const changeStatusSchema = z.object({
  status: z.enum(REQUEST_STATUSES),
  notes: z.string().max(500).optional()
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
