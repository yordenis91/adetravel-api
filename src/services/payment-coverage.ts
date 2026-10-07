import { prisma } from "../lib/prisma";
import { roundMoney } from "../utils/money";

interface Amount {
  amount: number;
  currency: string;
}

/**
 * ¿Los pagos completados cubren lo aceptado por el cliente? Se compara moneda por moneda: por
 * cada una, la suma de las cotizaciones ACEPTADAS debe estar cubierta por la suma de los pagos
 * COMPLETADOS en esa misma moneda. Sin cotizaciones aceptadas no hay nada contra qué comparar
 * y devuelve false: un pago suelto no puede dar la venta por pagada.
 */
export function isFullyCovered(
  acceptedQuotations: { total: number | null; currency: string }[],
  completedPayments: Amount[]
): boolean {
  const due = new Map<string, number>();
  for (const q of acceptedQuotations) {
    due.set(q.currency, (due.get(q.currency) ?? 0) + (q.total ?? 0));
  }
  if (due.size === 0) return false;

  for (const [currency, owed] of due) {
    const paid = completedPayments
      .filter((p) => p.currency === currency)
      .reduce((sum, p) => sum + p.amount, 0);
    if (roundMoney(paid, currency) < roundMoney(owed, currency)) return false;
  }
  return true;
}

/** Lee de la base las cotizaciones aceptadas y los pagos completados de una solicitud. */
export async function isRequestFullyPaid(requestId: string): Promise<boolean> {
  const [accepted, completed] = await Promise.all([
    prisma.quotation.findMany({ where: { requestId, status: "ACEPTADA" }, select: { total: true, currency: true } }),
    prisma.payment.findMany({ where: { requestId, status: "COMPLETADO" }, select: { amount: true, currency: true } }),
  ]);
  return isFullyCovered(accepted, completed);
}
