/** Fecha de hoy (YYYY-MM-DD) en la zona horaria dada; por defecto la de la agencia (Chile). */
export function todayISO(timeZone = "America/Santiago", now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** True si la fecha de vigencia (YYYY-MM-DD) ya pasó. Sin fecha, nunca vence. */
export function isExpired(validUntil: string | null | undefined, timeZone?: string, now?: Date): boolean {
  if (!validUntil) return false;
  return validUntil < todayISO(timeZone, now);
}

/** "2026-10-30" → "30/10/2026" (formato de Chile). Devuelve el texto tal cual si no tiene forma de fecha. */
export function formatDateCL(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? "");
}
