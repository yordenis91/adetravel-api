const mockClientCount = jest.fn();
const mockRequestCount = jest.fn();
const mockPaymentAggregate = jest.fn();
jest.mock("../../../src/lib/prisma", () => ({
  prisma: {
    client: { count: mockClientCount },
    request: { count: mockRequestCount },
    payment: { aggregate: mockPaymentAggregate },
  },
}));

import { CONFIRMED_TRIP_STATUSES, getDashboardTrends } from "../../../src/services/dashboard-trends.service";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("getDashboardTrends", () => {
  beforeEach(() => {
    mockClientCount.mockReset();
    mockRequestCount.mockReset();
    mockPaymentAggregate.mockReset();
  });

  it("compara los últimos 30 días con los 30 anteriores, con los valores de cada consulta", async () => {
    mockClientCount.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
    mockRequestCount.mockResolvedValueOnce(7).mockResolvedValueOnce(5).mockResolvedValueOnce(3).mockResolvedValueOnce(6);
    mockPaymentAggregate.mockResolvedValueOnce({ _sum: { amount: 900000 } }).mockResolvedValueOnce({ _sum: { amount: 600000 } });

    await expect(getDashboardTrends(NOW)).resolves.toEqual({
      windowDays: 30,
      clients: { current: 4, previous: 2 },
      requests: { current: 7, previous: 5 },
      confirmedTrips: { current: 3, previous: 6 },
      revenue: { current: 900000, previous: 600000 },
    });
  });

  it("las ventanas son [hoy-30d, hoy] y [hoy-60d, hoy-30d) sobre la fecha de creación", async () => {
    mockClientCount.mockResolvedValue(0);
    mockRequestCount.mockResolvedValue(0);
    mockPaymentAggregate.mockResolvedValue({ _sum: { amount: null } });
    await getDashboardTrends(NOW);

    const [current, previous] = mockClientCount.mock.calls.map((c) => c[0].where.createdAt);
    expect(current).toEqual({ gte: new Date(NOW.getTime() - 30 * DAY), lte: NOW });
    expect(previous).toEqual({ gte: new Date(NOW.getTime() - 60 * DAY), lt: new Date(NOW.getTime() - 30 * DAY) });
  });

  it("solicitudes excluyen canceladas; viajes confirmados usan solo los estados confirmados; ingresos solo CLP completados", async () => {
    mockClientCount.mockResolvedValue(0);
    mockRequestCount.mockResolvedValue(0);
    mockPaymentAggregate.mockResolvedValue({ _sum: { amount: null } });
    await getDashboardTrends(NOW);

    const wheres = mockRequestCount.mock.calls.map((c) => c[0].where);
    expect(wheres[0].status).toEqual({ not: "CANCELADA" });
    expect(wheres[2].status).toEqual({ in: [...CONFIRMED_TRIP_STATUSES] });
    expect(CONFIRMED_TRIP_STATUSES).not.toContain("CANCELADA");
    expect(CONFIRMED_TRIP_STATUSES).not.toContain("VENDIDA");
    for (const call of mockPaymentAggregate.mock.calls) {
      expect(call[0].where).toMatchObject({ status: "COMPLETADO", currency: "CLP" });
    }
  });

  it("sin pagos en una ventana el ingreso es 0, no null", async () => {
    mockClientCount.mockResolvedValue(0);
    mockRequestCount.mockResolvedValue(0);
    mockPaymentAggregate.mockResolvedValue({ _sum: { amount: null } });
    expect((await getDashboardTrends(NOW)).revenue).toEqual({ current: 0, previous: 0 });
  });
});
