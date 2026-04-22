import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";

export async function getStats(_req: Request, res: Response): Promise<void> {
  const [totalRequests, totalClients, totalQuotations, totalPayments, totalVouchers, totalRevenueAgg] =
    await Promise.all([
      prisma.request.count(),
      prisma.client.count({ where: { isActive: true } }),
      prisma.quotation.count(),
      prisma.payment.count({ where: { status: "COMPLETADO" } }),
      prisma.voucher.count(),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "COMPLETADO" } })
    ]);

  sendItem(res, {
    totalRequests,
    totalClients,
    totalQuotations,
    totalPayments,
    totalVouchers,
    totalRevenue: totalRevenueAgg._sum.amount ?? 0
  });
}

export async function getRequestsByMonth(_req: Request, res: Response): Promise<void> {
  const data = await prisma.$queryRaw<Array<{ month: string; total: bigint }>>`
    SELECT TO_CHAR("createdAt", 'YYYY-MM') AS month, COUNT(*)::bigint AS total
    FROM requests
    GROUP BY month
    ORDER BY month;
  `;
  sendList(res, data.map((x) => ({ month: x.month, total: Number(x.total) })), data.length, 1, data.length || 1);
}

export async function getPaymentsByMonth(_req: Request, res: Response): Promise<void> {
  const data = await prisma.$queryRaw<Array<{ month: string; total: number }>>`
    SELECT TO_CHAR("createdAt", 'YYYY-MM') AS month, COALESCE(SUM(amount), 0) AS total
    FROM payments
    GROUP BY month
    ORDER BY month;
  `;
  sendList(res, data, data.length, 1, data.length || 1);
}

export async function getQuotationsByStatus(_req: Request, res: Response): Promise<void> {
  const groups = await prisma.quotation.groupBy({ by: ["status"], _count: { _all: true } });
  const data = groups.map((g) => ({ status: g.status, total: g._count._all }));
  sendList(res, data, data.length, 1, data.length || 1);
}
