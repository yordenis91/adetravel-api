import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/api-error";

type NumberingEntity = "Request" | "Quotation" | "Payment" | "Voucher";

const entityFieldMap: Record<NumberingEntity, string> = {
  Request: "requestNumber",
  Quotation: "quotationNumber",
  Payment: "paymentNumber",
  Voucher: "voucherNumber"
};

export async function generateNumber(entity: NumberingEntity, prefix: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const start = new Date(`${year}-${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(year, now.getMonth() + 1, 1));

  const modelKey = entity.charAt(0).toLowerCase() + entity.slice(1);
  const model = prisma[modelKey as keyof typeof prisma];
  if (!model || typeof model !== "object" || !("count" in model)) {
    throw new ApiError("Entidad de numeración no soportada", 400, "INVALID_NUMBERING_ENTITY");
  }

  const count = await (model as { count: (args: object) => Promise<number> }).count({
    where: { createdAt: { gte: start, lt: end } }
  });

  const seq = String(count + 1).padStart(4, "0");
  return `${prefix}-${year}-${month}-${seq}`;
}

export function getNumberField(entity: NumberingEntity): string {
  return entityFieldMap[entity];
}
