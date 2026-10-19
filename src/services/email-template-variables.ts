import { formatMoney } from "../utils/money";
import { formatDateCL } from "../utils/dates";
import type { AgencyForEmail } from "./quotation-email";

/**
 * Valores de las variables de cada plantilla automática (ver TEMPLATE_VARIABLES_MAP). Un dato que falta va como
 * texto vacío: `fillTemplate` nunca deja una etiqueta `{{...}}` sin rellenar en el correo.
 */

interface ClientName { firstName: string; lastName?: string | null }

const fullName = (c: ClientName) => [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
const place = (city?: string | null, country?: string | null) => [city, country].filter(Boolean).join(", ");
const agencyVars = (a: AgencyForEmail) => ({ agency_name: a.name, agency_email: a.email ?? "" });

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo", TARJETA: "Tarjeta", TRANSFERENCIA: "Transferencia bancaria", CHEQUE: "Cheque", WEBPAY: "Webpay",
};

export function requestTemplateVariables(
  r: { requestNumber: string; requestDate?: string | null; createdAt?: Date; destinationCity?: string | null; destinationCountry?: string | null },
  client: ClientName,
  agency: AgencyForEmail,
): Record<string, string> {
  return {
    client_name: fullName(client),
    request_number: r.requestNumber,
    destination: place(r.destinationCity, r.destinationCountry),
    request_date: formatDateCL(r.requestDate || r.createdAt?.toISOString()),
    ...agencyVars(agency),
  };
}

export function paymentTemplateVariables(
  p: { paymentNumber: string; amount: number; currency: string; paymentDate?: string | null; method: string; reference?: string | null; createdAt?: Date },
  client: ClientName,
  agency: AgencyForEmail,
): Record<string, string> {
  return {
    client_name: fullName(client),
    payment_number: p.paymentNumber,
    amount: formatMoney(p.amount, p.currency),
    currency: p.currency,
    payment_date: formatDateCL(p.paymentDate || p.createdAt?.toISOString()),
    payment_method: PAYMENT_METHOD_LABEL[p.method] ?? p.method,
    reference: p.reference ?? "",
    ...agencyVars(agency),
  };
}

export function voucherTemplateVariables(
  v: { voucherNumber: string; serviceName?: string | null; serviceType?: string | null; destination?: string | null; checkIn?: string | null; checkOut?: string | null; confirmationCode?: string | null; passengerNames?: string[] },
  client: ClientName,
  agency: AgencyForEmail,
): Record<string, string> {
  return {
    client_name: fullName(client),
    voucher_number: v.voucherNumber,
    service_name: v.serviceName ?? "",
    service_type: v.serviceType ?? "",
    destination: v.destination ?? "",
    check_in: v.checkIn ? formatDateCL(v.checkIn) : "",
    check_out: v.checkOut ? formatDateCL(v.checkOut) : "",
    confirmation_code: v.confirmationCode || "Pendiente",
    passengers: (v.passengerNames ?? []).join(", "),
    ...agencyVars(agency),
  };
}

export function birthdayTemplateVariables(client: ClientName, agency: AgencyForEmail): Record<string, string> {
  return {
    client_name: client.firstName || "viajero",
    client_full_name: fullName(client) || "viajero",
    ...agencyVars(agency),
  };
}
