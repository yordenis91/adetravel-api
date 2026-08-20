import { z } from "zod";

// Flujo granular de 17 estados compartido por Request (Solicitud) y Service (Servicio),
// tal como lo describe el documento de requisitos (secciones 3.1 y 4.1-4.17).
// Nota: la lista resumen del documento (pág. 10-12) enumera 16 estados, pero la sección 4.14
// define un estado adicional ("Enviada Solicitud de Pago al Cliente") que también aparece en
// el diagrama BPMN y en el requisito de notificaciones 6.12 — se incluye aquí como el 17º estado.
export const WORKFLOW_STATUSES = [
  "RECEPCIONADA",
  "SERVICIOS_ASIGNADOS_PARA_COTIZAR",
  "ENVIADO_A_PROVEEDOR",
  "COTIZADO_POR_PROVEEDOR",
  "COTIZADO_POR_ADETRAVEL",
  "ENVIADO_AL_CLIENTE",
  "ACEPTADA_POR_CLIENTE",
  "ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR",
  "CONFIRMADA_POR_PROVEEDOR",
  "ENVIADA_CONFIRMACION_CLIENTE",
  "ENVIADA_SOLICITUD_PAGO_CLIENTE",
  "PAGADO_POR_CLIENTE",
  "PAGADO_AL_PROVEEDOR",
  "VOUCHER_EMITIDO",
  "VOUCHER_ENTREGADO",
  "VENDIDA",
  "CANCELADA",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

// Mapa de adyacencia reconstruido del diagrama BPMN (pág. 8) y las secciones 4.1-4.17.
export const VALID_TRANSITIONS: Record<string, string[]> = {
  RECEPCIONADA: ["SERVICIOS_ASIGNADOS_PARA_COTIZAR", "CANCELADA"],
  SERVICIOS_ASIGNADOS_PARA_COTIZAR: ["ENVIADO_A_PROVEEDOR", "CANCELADA"],
  ENVIADO_A_PROVEEDOR: ["COTIZADO_POR_PROVEEDOR", "CANCELADA"],
  COTIZADO_POR_PROVEEDOR: ["COTIZADO_POR_ADETRAVEL", "CANCELADA"],
  COTIZADO_POR_ADETRAVEL: ["ENVIADO_AL_CLIENTE", "CANCELADA"],
  ENVIADO_AL_CLIENTE: ["ACEPTADA_POR_CLIENTE", "RECEPCIONADA", "CANCELADA"],
  ACEPTADA_POR_CLIENTE: ["ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR", "CANCELADA"],
  ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR: ["CONFIRMADA_POR_PROVEEDOR", "ENVIADO_AL_CLIENTE", "CANCELADA"],
  CONFIRMADA_POR_PROVEEDOR: ["ENVIADA_CONFIRMACION_CLIENTE", "CANCELADA"],
  ENVIADA_CONFIRMACION_CLIENTE: ["ENVIADA_SOLICITUD_PAGO_CLIENTE", "CANCELADA"],
  ENVIADA_SOLICITUD_PAGO_CLIENTE: ["PAGADO_POR_CLIENTE", "CANCELADA"],
  PAGADO_POR_CLIENTE: ["PAGADO_AL_PROVEEDOR"],
  PAGADO_AL_PROVEEDOR: ["VOUCHER_EMITIDO"],
  VOUCHER_EMITIDO: ["VOUCHER_ENTREGADO"],
  VOUCHER_ENTREGADO: ["VENDIDA"],
  VENDIDA: [],
  CANCELADA: ["RECEPCIONADA"],
};

// Estados que un Servicio alcanza de forma independiente y que "burbujean" hacia la
// Solicitud cuando TODOS los servicios de esa solicitud llegan al mismo estado.
// Nota sobre ENVIADO_AL_CLIENTE/ACEPTADA_POR_CLIENTE: la sección 4 (4.8/4.9) describe estas
// acciones genéricamente como aplicables "al servicio o la solicitud", por lo que se tratan
// aquí igual que el resto de los estados intermedios (burbujean cuando todos los servicios
// llegan ahí). El resumen de estados (pág. 10-11) además describe explícitamente un camino
// *adicional*, a nivel Solicitud, para ACEPTADA_POR_CLIENTE ("... automáticamente todos los
// servicios... pasan al mismo estado") — ver CASCADE_DOWN_STATUSES, que cubre ese segundo caso
// (aceptación manual de la solicitud completa / modo Paquete).
export const BUBBLE_UP_STATUSES: WorkflowStatus[] = [
  "SERVICIOS_ASIGNADOS_PARA_COTIZAR",
  "ENVIADO_A_PROVEEDOR",
  "COTIZADO_POR_PROVEEDOR",
  "COTIZADO_POR_ADETRAVEL",
  "ENVIADO_AL_CLIENTE",
  "ACEPTADA_POR_CLIENTE",
  "CONFIRMADA_POR_PROVEEDOR",
  "PAGADO_AL_PROVEEDOR",
  "VOUCHER_EMITIDO",
];

// Estados que se fijan a nivel Solicitud (acción manual sobre la solicitud completa, o modo
// Paquete) y descienden automáticamente a todos sus Servicios.
export const CASCADE_DOWN_STATUSES: WorkflowStatus[] = [
  "ACEPTADA_POR_CLIENTE",
  "CANCELADA",
  "PAGADO_POR_CLIENTE",
  "VOUCHER_ENTREGADO",
  "VENDIDA",
];

/** Índice de progreso dentro del flujo (CANCELADA queda fuera del orden lineal). */
const PROGRESS_ORDER: WorkflowStatus[] = WORKFLOW_STATUSES.filter((s) => s !== "CANCELADA");

export function isAtOrAfter(current: string, target: WorkflowStatus): boolean {
  const currentIdx = PROGRESS_ORDER.indexOf(current as WorkflowStatus);
  const targetIdx = PROGRESS_ORDER.indexOf(target);
  if (currentIdx === -1 || targetIdx === -1) return false;
  return currentIdx >= targetIdx;
}

// Esquema de cambio de estado compartido por Solicitud y Servicio: exige `cancellationReason`
// (regla de negocio #12) cuando el destino es CANCELADA.
export const changeStatusSchema = z
  .object({
    status: z.enum(WORKFLOW_STATUSES),
    notes: z.string().max(500).optional(),
    cancellationReason: z.string().min(1, "El motivo de cancelación es obligatorio").max(1000).optional(),
  })
  .refine((data) => data.status !== "CANCELADA" || !!data.cancellationReason, {
    message: "Debe indicar el motivo de cancelación",
    path: ["cancellationReason"],
  });

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
