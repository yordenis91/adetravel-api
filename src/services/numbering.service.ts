import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/api-error";

type NumberingEntity = "Request" | "Quotation" | "Payment" | "Voucher" | "Service" | "Confirmation";

const entityFieldMap: Record<NumberingEntity, string> = {
  Request: "requestNumber",
  Quotation: "quotationNumber",
  Payment: "paymentNumber",
  Voucher: "voucherNumber",
  Service: "serviceNumber",
  Confirmation: "confirmationNumber"
};

/**
 * Siguiente correlativo de un mes: mayor secuencia ya usada con ese prefijo + 1.
 * Antes era `cantidad de registros del mes + 1`, que repetía un número existente en cuanto se
 * borraba un registro (con 0001, 0002 y 0003, borrar el 0001 hacía que el siguiente fuera
 * 0003 otra vez) y la creación fallaba por la restricción única.
 */
export function nextSequence(existingNumbers: string[], base: string): number {
  let max = 0;
  for (const number of existingNumbers) {
    if (!number.startsWith(base)) continue;
    const seq = Number(number.slice(base.length));
    if (Number.isInteger(seq) && seq > max) max = seq;
  }
  return max + 1;
}

export async function generateNumber(entity: NumberingEntity, prefix: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const base = `${prefix}-${year}-${month}-`;

  const modelKey = entity.charAt(0).toLowerCase() + entity.slice(1);
  const model = prisma[modelKey as keyof typeof prisma];
  if (!model || typeof model !== "object" || !("findMany" in model)) {
    throw new ApiError("Entidad de numeración no soportada", 400, "INVALID_NUMBERING_ENTITY");
  }

  const field = entityFieldMap[entity];
  const rows = await (model as unknown as { findMany: (args: object) => Promise<Record<string, string>[]> }).findMany({
    where: { [field]: { startsWith: base } },
    select: { [field]: true }
  });

  const seq = String(nextSequence(rows.map((row) => row[field]), base)).padStart(4, "0");
  return `${base}${seq}`;
}

export function getNumberField(entity: NumberingEntity): string {
  return entityFieldMap[entity];
}
