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

/** Datos de contacto de la agencia para mostrar en pantalla (vista previa de cotización y voucher). */
export interface AgencyInfo {
  name: string;
  rut: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

const clean = (value: string | null | undefined) => value?.trim() || null;

/**
 * Solo los campos públicos de Configuración > Agencia. Nunca devuelve el resto de la configuración
 * (SMTP, claves, tasas): este endpoint lo puede leer cualquier usuario autenticado.
 */
export async function getAgencyInfo(): Promise<AgencyInfo> {
  const config = await prisma.systemConfig.findFirst();
  return {
    name: clean(config?.agencyFantasyName) ?? clean(config?.agencyName) ?? FALLBACK_NAME,
    rut: clean(config?.agencyRut),
    address: clean(config?.agencyAddress),
    phone: clean(config?.agencyPhone),
    email: clean(config?.agencyEmail),
    website: clean(config?.agencyWebsite),
  };
}
