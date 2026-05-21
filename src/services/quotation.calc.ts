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

export function calculateTotals(items: QuotationItem[], taxPercentage: number, discount: number): QuotationTotals {
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const taxAmount = Math.round((discountedSubtotal * taxPercentage) / 100);
  const total = discountedSubtotal + taxAmount;

  return { subtotal: Math.round(subtotal), taxAmount, total };
}

export function normalizeItems(items: QuotationItem[]): QuotationItem[] {
  return items.map(item => ({
    ...item,
    total: Math.round(item.quantity * item.unitPrice),
  }));
}