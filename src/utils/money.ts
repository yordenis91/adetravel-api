/** Decimales que maneja cada moneda: el peso chileno no tiene centavos, el dólar sí. */
export function currencyDecimals(currency: string | null | undefined): number {
  return currency === "USD" ? 2 : 0;
}

/** Redondea a los decimales de la moneda; el epsilon evita errores del tipo 1.005 -> 1.00. */
export function roundMoney(value: number, currency: string | null | undefined): number {
  const factor = 10 ** currencyDecimals(currency);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Monto para mostrar (es-CL) con los decimales de la moneda: 1.234 CLP, 1.234,50 USD. */
export function formatMoney(value: number, currency: string | null | undefined): string {
  const digits = currencyDecimals(currency);
  return value.toLocaleString("es-CL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
