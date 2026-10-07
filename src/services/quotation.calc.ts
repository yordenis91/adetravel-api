import { roundMoney } from "../utils/money";

export interface QuotationItem {
  service: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface QuotationTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

/**
 * Totales de una cotización. Cada línea se redondea primero a los decimales de la moneda y el
 * subtotal es la suma de esas líneas ya redondeadas, así lo que se imprime siempre cuadra:
 * subtotal - descuento + IVA = total. (Antes todo se redondeaba a enteros, lo que en USD
 * perdía los centavos y dejaba un total que no coincidía con subtotal + IVA.)
 */
export function calculateTotals(
  items: QuotationItem[],
  taxPercentage: number,
  discount: number,
  currency: string = "CLP"
): QuotationTotals {
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + roundMoney(item.quantity * item.unitPrice, currency), 0),
    currency
  );
  const discountedSubtotal = roundMoney(Math.max(0, subtotal - discount), currency);
  const taxAmount = roundMoney((discountedSubtotal * taxPercentage) / 100, currency);
  const total = roundMoney(discountedSubtotal + taxAmount, currency);

  return { subtotal, taxAmount, total };
}

export function normalizeItems(items: QuotationItem[], currency: string = "CLP"): QuotationItem[] {
  return items.map(item => ({
    ...item,
    total: roundMoney(item.quantity * item.unitPrice, currency),
  }));
}
