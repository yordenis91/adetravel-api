import { prisma } from "../lib/prisma";

/** Datos de la agencia que aparecen en el encabezado de los documentos (cotización, voucher). */
export interface AgencyHeader {
  name: string;
  /** Solo si está configurado: nunca se imprime un RUT de relleno. */
  rut?: string;
  /** Dirección, teléfono y correo unidos en una línea; ausente si no hay ninguno. */
  contact?: string;
}

const FALLBACK_NAME = "ADE Travel";

/** Lee la configuración de la agencia (Configuración > Agencia) para los encabezados de los PDF. */
export async function getAgencyHeader(): Promise<AgencyHeader> {
  const config = await prisma.systemConfig.findFirst();
  const contact = [config?.agencyAddress, config?.agencyPhone, config?.agencyEmail]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ");

  return {
    name: config?.agencyFantasyName?.trim() || config?.agencyName?.trim() || FALLBACK_NAME,
    rut: config?.agencyRut?.trim() || undefined,
    contact: contact || undefined,
  };
}
