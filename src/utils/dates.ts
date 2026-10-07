/** Fecha de hoy (YYYY-MM-DD) en la zona horaria dada; por defecto la de la agencia (Chile). */
export function todayISO(timeZone = "America/Santiago", now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** True si la fecha de vigencia (YYYY-MM-DD) ya pasó. Sin fecha, nunca vence. */
export function isExpired(validUntil: string | null | undefined, timeZone?: string, now?: Date): boolean {
  if (!validUntil) return false;
  return validUntil < todayISO(timeZone, now);
}
