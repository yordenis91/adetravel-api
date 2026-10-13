import { prisma } from "../lib/prisma";

/**
 * Tendencias del panel: cada tarjeta compara los últimos 30 días con los 30 anteriores, según la fecha
 * de creación del registro. Son flujos (altas del período), no el stock actual que muestra el número grande.
 */
export const TREND_WINDOW_DAYS = 30;

export interface TrendPair {
  current: number;
  previous: number;
}

export interface DashboardTrends {
  windowDays: number;
  clients: TrendPair;
  requests: TrendPair;
  confirmedTrips: TrendPair;
  revenue: TrendPair;
}

/** Misma lista que usa el panel para "Viajes confirmados" (ya pasaron por la confirmación del proveedor, sin Vendida/Cancelada). */
export const CONFIRMED_TRIP_STATUSES = [
  "ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR", "CONFIRMADA_POR_PROVEEDOR", "ENVIADA_CONFIRMACION_CLIENTE",
  "ENVIADA_SOLICITUD_PAGO_CLIENTE", "PAGADO_POR_CLIENTE", "PAGADO_AL_PROVEEDOR",
  "VOUCHER_EMITIDO", "VOUCHER_ENTREGADO",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getDashboardTrends(now: Date = new Date()): Promise<DashboardTrends> {
  const currentFrom = new Date(now.getTime() - TREND_WINDOW_DAYS * DAY_MS);
  const previousFrom = new Date(now.getTime() - 2 * TREND_WINDOW_DAYS * DAY_MS);
  const currentRange = { gte: currentFrom, lte: now };
  const previousRange = { gte: previousFrom, lt: currentFrom };

  // Secuencial, como el resto del reporte: evita avisos de conexión de PG.
  const clients = {
    current: await prisma.client.count({ where: { createdAt: currentRange } }),
    previous: await prisma.client.count({ where: { createdAt: previousRange } }),
  };

  const requestWhere = (createdAt: object) => ({ createdAt, status: { not: "CANCELADA" as const } });
  const requests = {
    current: await prisma.request.count({ where: requestWhere(currentRange) }),
    previous: await prisma.request.count({ where: requestWhere(previousRange) }),
  };

  const confirmedWhere = (createdAt: object) => ({ createdAt, status: { in: [...CONFIRMED_TRIP_STATUSES] } });
  const confirmedTrips = {
    current: await prisma.request.count({ where: confirmedWhere(currentRange) }),
    previous: await prisma.request.count({ where: confirmedWhere(previousRange) }),
  };

  const revenueIn = async (createdAt: object) =>
    (await prisma.payment.aggregate({ _sum: { amount: true }, where: { createdAt, status: "COMPLETADO", currency: "CLP" } }))._sum.amount || 0;
  const revenue = { current: await revenueIn(currentRange), previous: await revenueIn(previousRange) };

  return { windowDays: TREND_WINDOW_DAYS, clients, requests, confirmedTrips, revenue };
}
