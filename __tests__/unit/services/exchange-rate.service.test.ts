// Sincronización de tasas: cuándo toca (auto), enfriamiento (manual), resultado y registro del intento.
const mockFindFirst = jest.fn();
const mockUpdate = jest.fn().mockResolvedValue({});
jest.mock("../../../src/lib/prisma", () => ({ prisma: { systemConfig: { findFirst: mockFindFirst, update: mockUpdate } } }));
const mockGet = jest.fn();
jest.mock("axios", () => ({ __esModule: true, default: { get: mockGet } }));
jest.mock("../../../src/services/activity-log.service", () => ({ createActivityLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../../src/utils/logger", () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isAutoSyncDue, manualCooldownMinutes, syncExchangeRates } = require("../../../src/services/exchange-rate.service");

const MIN = 60_000;
const now = new Date("2026-10-08T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * MIN);
const base = { exchangeAutoSync: true, exchangeSyncIntervalMinutes: 480, exchangeLastAttemptAt: null, exchangeLastSyncAt: null };

describe("isAutoSyncDue", () => {
  it("sincroniza si nunca se ha intentado", () => expect(isAutoSyncDue(base, now)).toBe(true));
  it("no sincroniza con la opción apagada", () => expect(isAutoSyncDue({ ...base, exchangeAutoSync: false }, now)).toBe(false));
  it("espera el intervalo completo tras un éxito (3 veces al día = 480 min)", () => {
    const ok = (m: number) => ({ ...base, exchangeLastAttemptAt: ago(m), exchangeLastSyncAt: ago(m) });
    expect(isAutoSyncDue(ok(479), now)).toBe(false);
    expect(isAutoSyncDue(ok(480), now)).toBe(true);
  });
  it("tras un fallo reintenta a los 30 min, no en cada tick ni al cabo de todo el intervalo", () => {
    const failed = (m: number) => ({ ...base, exchangeLastAttemptAt: ago(m), exchangeLastSyncAt: ago(600) });
    expect(isAutoSyncDue(failed(10), now)).toBe(false);
    expect(isAutoSyncDue(failed(30), now)).toBe(true);
  });
  it("un intervalo menor al mínimo se trata como 15 min", () => {
    expect(isAutoSyncDue({ ...base, exchangeSyncIntervalMinutes: 1, exchangeLastAttemptAt: ago(10), exchangeLastSyncAt: ago(10) }, now)).toBe(false);
  });
});

describe("manualCooldownMinutes", () => {
  it("es la mitad del intervalo, con piso de 5 min", () => {
    expect(manualCooldownMinutes(480)).toBe(240);
    expect(manualCooldownMinutes(15)).toBe(7);
    expect(manualCooldownMinutes(2)).toBe(5);
  });
});

describe("syncExchangeRates", () => {
  const rates = JSON.stringify([
    { id: "1", fromCurrency: "USD", toCurrency: "CLP", rate: 900, label: "Dólar", isActive: true, lastUpdated: "2026-01-01T00:00:00Z" },
    { id: "2", fromCurrency: "USD", toCurrency: "XXX", rate: 5, label: "Sin dato", isActive: true, lastUpdated: "2026-01-01T00:00:00Z" }
  ]);
  const config = { ...base, id: "cfg", exchangeRates: rates };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CURRENCY_API_KEY = "k";
  });

  it("auto: actualiza las tasas con dato, conserva las demás y registra éxito", async () => {
    mockFindFirst.mockResolvedValue(config);
    mockGet.mockResolvedValue({ data: { rates: { USD: 1, CLP: 950 } } });
    await expect(syncExchangeRates("auto")).resolves.toEqual({ status: "synced", updated: 1 });
    const saved = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1][0].data;
    const parsed = JSON.parse(saved.exchangeRates);
    expect(parsed[0].rate).toBe(950);
    expect(parsed[1].rate).toBe(5);
    expect(saved.exchangeLastSyncError).toBeNull();
    expect(saved.exchangeLastSyncAt).toBeInstanceOf(Date);
  });

  it("auto: no llama a la API si aún no toca", async () => {
    mockFindFirst.mockResolvedValue({ ...config, exchangeLastAttemptAt: new Date(), exchangeLastSyncAt: new Date() });
    await expect(syncExchangeRates("auto")).resolves.toEqual({ status: "skipped", reason: "not-due" });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("manual: respeta el enfriamiento", async () => {
    mockFindFirst.mockResolvedValue({ ...config, exchangeLastSyncAt: new Date(Date.now() - 60 * MIN) });
    const r = await syncExchangeRates("manual");
    expect(r).toMatchObject({ status: "skipped", reason: "cooldown" });
    expect(r.retryAfterMinutes).toBeGreaterThan(170);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("sin API key no consulta ni marca intento", async () => {
    delete process.env.CURRENCY_API_KEY;
    mockFindFirst.mockResolvedValue(config);
    await expect(syncExchangeRates("auto")).resolves.toEqual({ status: "skipped", reason: "no-api-key" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("si la API falla guarda el error, marca el intento y no toca las tasas", async () => {
    mockFindFirst.mockResolvedValue(config);
    mockGet.mockRejectedValue({ message: "boom", response: { status: 429 } });
    const r = await syncExchangeRates("auto");
    expect(r).toEqual({ status: "failed", message: "El proveedor de divisas respondió con error 429." });
    const writes = mockUpdate.mock.calls.map((c) => c[0].data);
    expect(writes[0]).toHaveProperty("exchangeLastAttemptAt");
    expect(writes[1]).toEqual({ exchangeLastSyncError: r.message });
  });
});
