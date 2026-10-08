import { z } from "zod";
import { SERVICE_TYPES } from "./services.validator";

/**
 * Tipos de servicio unificados para solicitudes, servicios y vouchers (D9).
 *
 * Antes cada entidad tenía su lista: la solicitud usaba `HOTEL`, `AEREO`, `TOUR`…, el servicio
 * `ALOJAMIENTO`, `PASAJE_AEREO`, `EXCURSION`… y el voucher `AÉREO`, `RESTAURANT`… La lista común es
 * la del servicio (el catálogo con detalle por tipo) más `OTRO`. Los valores antiguos se siguen
 * aceptando y se guardan ya convertidos; la migración `unify_service_types` convierte los guardados.
 */
export const UNIFIED_SERVICE_TYPES = [...SERVICE_TYPES, "OTRO"] as const;
export type UnifiedServiceType = (typeof UNIFIED_SERVICE_TYPES)[number];

/** Valores antiguos → valor unificado. Debe coincidir con la migración SQL. */
export const LEGACY_SERVICE_TYPE_ALIASES: Record<string, UnifiedServiceType> = {
  HOTEL: "ALOJAMIENTO",
  AEREO: "PASAJE_AEREO",
  "AÉREO": "PASAJE_AEREO",
  TOUR: "EXCURSION",
  TRANSFER: "TRASLADO",
  RENT_A_CAR: "ARRIENDO_AUTO",
  RESTAURANT: "OTRO",
  PAQUETE: "OTRO", // solo lo usaba el seed de demostración
};

export const SERVICE_TYPE_LABELS: Record<UnifiedServiceType, string> = {
  SEGURO: "Seguro",
  VISA: "Visa",
  ALOJAMIENTO: "Alojamiento",
  PASAJE_AEREO: "Pasaje aéreo",
  ARRIENDO_AUTO: "Arriendo de auto",
  EXCURSION: "Excursión",
  TRASLADO: "Traslado",
  CRUCERO: "Crucero",
  CIRCUITO: "Circuito",
  OTRO: "Otro",
};

export function normalizeServiceType(value: string): string {
  return LEGACY_SERVICE_TYPE_ALIASES[value] ?? value;
}

/** Nombre legible para documentos (PDF); un valor desconocido se muestra tal cual. */
export function serviceTypeLabel(value?: string | null): string {
  if (!value) return "";
  const normalized = normalizeServiceType(value) as UnifiedServiceType;
  return SERVICE_TYPE_LABELS[normalized] ?? value;
}

/** Acepta un tipo unificado o uno antiguo y devuelve siempre el unificado. */
export const serviceTypeInput = z
  .string()
  .transform(normalizeServiceType)
  .pipe(z.enum(UNIFIED_SERVICE_TYPES, { error: "Tipo de servicio no válido" }));
