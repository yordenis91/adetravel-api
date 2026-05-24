import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem } from "../utils/response";

export async function getReport(req: Request, res: Response): Promise<void> {
  const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };
  
  // 1. Construir filtro de fechas global
  const dateFilter: any = {};
  if (dateFrom || dateTo) {
    dateFilter.createdAt = {};
    if (dateFrom) dateFilter.createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
    if (dateTo) dateFilter.createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
  }

  // 2. Ejecución secuencial para evitar advertencias de conexión PG
  // --- KPIs Principales ---
  const totalClients = await prisma.client.count({ where: dateFilter });
  const totalRequests = await prisma.request.count({ 
    where: { ...dateFilter, status: { not: "CANCELADA" } } 
  });
  const acceptedQuotations = await prisma.quotation.count({ 
    where: { ...dateFilter, status: "ACEPTADA" } 
  });
  
  const revenueAgg = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: { ...dateFilter, status: "COMPLETADO", currency: "CLP" }
  });
  const totalRevenue = revenueAgg._sum.amount || 0;

  // --- Agrupaciones (Mucho más rápido usando GROUP BY nativo) ---
  const reqGroups = await prisma.request.groupBy({ 
    by: ["status"], _count: { id: true }, where: dateFilter 
  });
  const requestsByStatus = reqGroups.map(g => ({ status: g.status, count: g._count.id }));

  const quoGroups = await prisma.quotation.groupBy({ 
    by: ["status"], _count: { id: true }, where: dateFilter 
  });
  const quotationsByStatus = quoGroups.map(g => ({ status: g.status, count: g._count.id }));

  const payGroups = await prisma.payment.groupBy({ 
    by: ["method"], _count: { id: true }, where: dateFilter 
  });
  const paymentsByMethod = payGroups.map(g => ({ method: g.method, count: g._count.id }));

  const cliGroups = await prisma.client.groupBy({ 
    by: ["referralSource"], _count: { id: true }, where: dateFilter 
  });
  const clientsBySource = cliGroups.map(g => ({ source: g.referralSource || "OTROS", count: g._count.id }));

  // --- Tabla de Recientes ---
  const recentConfirmed = await prisma.request.findMany({
    where: { ...dateFilter, status: { in: ["CONFIRMADA", "VENDIDA"] } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { 
      id: true, requestNumber: true, destinationCity: true, 
      destinationCountry: true, status: true, createdAt: true 
    }
  });

  // 3. Responder con el mega-paquete de datos
  sendItem(res, {
    summary: {
      totalClients,
      totalRequests,
      acceptedQuotations,
      totalRevenue,
      formattedRevenue: new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(totalRevenue)
    },
    requestsByStatus,
    quotationsByStatus,
    paymentsByMethod,
    clientsBySource,
    recentConfirmed
  });
}