import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/api-error";
import { roundMoney } from "../utils/money";

interface FullPaymentInput {
  requestId: string;
  quotationId?: string | null;
  amount: number;
  currency: string;
  /** Al editar un pago: se excluye a sí mismo de la búsqueda de pagos duplicados. */
  excludePaymentId?: string;
}

/**
 * Regla "sin pagos parciales" (ALLOW_PARTIAL_PAYMENTS=false, decisión asumida; ver
 * DECISIONES_PENDIENTES.md): cada pago es por el total de UNA cotización aceptada.
 *
 * - Si no se indica cotización, se usa la única cotización aceptada de la solicitud en esa
 *   moneda; si hay varias hay que indicarla, y si no hay ninguna todavía no se puede cobrar.
 * - El monto debe ser exactamente el total de la cotización.
 * - No puede haber ya otro pago pendiente o completado para esa cotización.
 *
 * Devuelve el id de la cotización a la que queda asociado el pago.
 */
export async function resolveFullPaymentQuotation(input: FullPaymentInput): Promise<string> {
  const { requestId, amount, currency, excludePaymentId } = input;

  let quotation: { id: string; total: number | null; currency: string } | null;
  if (input.quotationId) {
    quotation = await prisma.quotation.findFirst({
      where: { id: input.quotationId, requestId },
      select: { id: true, total: true, currency: true, status: true },
    });
    if (!quotation) throw new ApiError("La cotización no pertenece a la solicitud seleccionada", 400);
    if ((quotation as { status?: string }).status !== "ACEPTADA") {
      throw new ApiError("Solo se puede cobrar una cotización aceptada por el cliente", 409, "QUOTATION_NOT_ACCEPTED");
    }
  } else {
    const accepted = await prisma.quotation.findMany({
      where: { requestId, status: "ACEPTADA", currency },
      select: { id: true, total: true, currency: true },
    });
    if (accepted.length === 0) {
      throw new ApiError(
        "La solicitud no tiene una cotización aceptada en esa moneda: no hay nada que cobrar todavía",
        409,
        "NO_ACCEPTED_QUOTATION"
      );
    }
    if (accepted.length > 1) {
      throw new ApiError("La solicitud tiene varias cotizaciones aceptadas: indica cuál se está pagando", 400, "QUOTATION_REQUIRED");
    }
    quotation = accepted[0];
  }

  if (currency !== quotation.currency) {
    throw new ApiError(
      `La moneda del pago (${currency}) no coincide con la de la cotización (${quotation.currency})`,
      400,
      "CURRENCY_MISMATCH"
    );
  }

  const expected = roundMoney(quotation.total ?? 0, currency);
  if (roundMoney(amount, currency) !== expected) {
    throw new ApiError(
      `No se permiten pagos parciales: el pago debe ser por el total de la cotización (${currency} ${expected})`,
      400,
      "PARTIAL_PAYMENT_NOT_ALLOWED"
    );
  }

  const existing = await prisma.payment.count({
    where: {
      quotationId: quotation.id,
      status: { in: ["PENDIENTE", "COMPLETADO"] },
      ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}),
    },
  });
  if (existing > 0) {
    throw new ApiError("Esa cotización ya tiene un pago registrado", 409, "PAYMENT_ALREADY_EXISTS");
  }

  return quotation.id;
}
