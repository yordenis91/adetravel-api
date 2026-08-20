import { z } from "zod";
import { VALID_TRANSITIONS, WORKFLOW_STATUSES, changeStatusSchema } from "./workflow-status";

export const SERVICE_TYPES = [
  "HOTEL", "AEREO", "TOUR", "TRANSFER", "SEGURO", "RENT_A_CAR", "CRUCERO", "OTRO"
] as const;

// El flujo de 17 estados y su mapa de transiciones ahora vive en ./workflow-status.ts
// (compartido con Service). Se re-exportan aquí para no romper los imports existentes.
export { VALID_TRANSITIONS, WORKFLOW_STATUSES, changeStatusSchema };
export const REQUEST_STATUSES = WORKFLOW_STATUSES;
export type RequestStatus = (typeof WORKFLOW_STATUSES)[number];

// 1. Creamos el ESQUEMA BASE puro (sin refinamientos)
const baseRequestSchema = z.object({
  clientId: z.string().min(1, "El cliente es obligatorio"),
  isPackage: z.boolean().default(false),
  requestDate: z.string().optional(),
  originCountry: z.string().max(100).optional(),
  originCity: z.string().max(100).optional(),
  destinationCountry: z.string().min(1, "El pais de destino es obligatorio").max(100),
  destinationCity: z.string().min(1, "La ciudad de destino es obligatoria").max(100),
  durationDays: z.coerce.number().int().min(1).max(365).optional(),
  budgetMin: z.coerce.number().min(0).optional(),
  budgetMax: z.coerce.number().min(0).optional(),
  description: z.string().max(2000).optional(),
  services: z.array(z.enum(SERVICE_TYPES)).default([])
});

// 2. Función auxiliar para el refinamiento de presupuestos
const validateBudget = (data: any) => {
  if (data.budgetMin !== undefined && data.budgetMax !== undefined) {
    return data.budgetMax >= data.budgetMin;
  }
  return true;
};

// 3. Aplicamos el refinamiento a la versión de Creación
export const createRequestSchema = baseRequestSchema.refine(validateBudget, {
  message: "El presupuesto maximo debe ser mayor o igual al minimo",
  path: ["budgetMax"]
});

// 4. Aplicamos .partial() AL ESQUEMA BASE y luego lo refinamos para la actualización
export const updateRequestSchema = baseRequestSchema.partial().refine(validateBudget, {
  message: "El presupuesto maximo debe ser mayor o igual al minimo",
  path: ["budgetMax"]
});

// 5. Exports de tipos inferidos (¡Los que notaste antes!)
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
