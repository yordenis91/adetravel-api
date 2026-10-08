// Alertas de operación: log + Sentry + correo, sin repetir el mismo aviso; heartbeat del backup;
// alerta de disco; y registro de trabajos según JOBS_ENABLED.
process.env.ALERT_EMAIL = "ops@example.com";
process.env.BACKUP_HEARTBEAT_URL = "https://hc.example.com/ping/abc/";
process.env.DISK_ALERT_MIN_FREE_PERCENT = "15";

const mockCaptureMessage = jest.fn();
jest.mock("@sentry/node", () => ({ captureMessage: mockCaptureMessage, captureException: jest.fn() }));
const mockSendEmail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../src/services/email.service", () => ({ sendEmail: mockSendEmail }));
const mockSchedule = jest.fn();
jest.mock("node-cron", () => ({ __esModule: true, default: { schedule: mockSchedule }, schedule: mockSchedule }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { raiseOpsAlert, pingBackupHeartbeat, resetOpsAlertState } = require("../../../src/services/ops-alert.service");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runDiskSpaceJob } = require("../../../src/jobs/diskSpace.job");

describe("alertas de operación", () => {
  beforeEach(() => {
    resetOpsAlertState();
    jest.clearAllMocks();
  });

  it("envía a Sentry y por correo, y no repite la misma alerta dentro del plazo", async () => {
    const t0 = Date.UTC(2026, 9, 8, 10);
    expect(await raiseOpsAlert("DISK_LOW", "Disco casi lleno", { libre: "9 %" }, { now: t0 })).toBe(true);
    expect(mockCaptureMessage).toHaveBeenCalledWith("[DISK_LOW] Disco casi lleno", expect.objectContaining({ level: "error", tags: { alert: "DISK_LOW" } }));
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ops@example.com", subject: "[AdeTravel][alerta] Disco casi lleno" }));
    expect(mockSendEmail.mock.calls[0][0].html).toContain("9 %");

    expect(await raiseOpsAlert("DISK_LOW", "Disco casi lleno", {}, { now: t0 + 60 * 60_000 })).toBe(false);
    expect(await raiseOpsAlert("DISK_LOW", "Disco casi lleno", {}, { now: t0 + 7 * 60 * 60_000 })).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it("un fallo del correo no rompe la alerta", async () => {
    mockSendEmail.mockRejectedValueOnce(new Error("SMTP caído"));
    await expect(raiseOpsAlert("BACKUP_FAILED", "Backup falló", {}, { repeatAfterMinutes: 0 })).resolves.toBe(true);
  });

  it("el heartbeat del backup llama a la URL al terminar bien y a /fail si falla, sin lanzar", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    await pingBackupHeartbeat(true, fetchImpl);
    await pingBackupHeartbeat(false, fetchImpl);
    expect(fetchImpl.mock.calls.map(([u]: [string]) => u)).toEqual(["https://hc.example.com/ping/abc/", "https://hc.example.com/ping/abc/fail"]);
    await expect(pingBackupHeartbeat(true, jest.fn().mockRejectedValue(new Error("sin red")))).resolves.toBeUndefined();
  });

  it("la alerta de disco salta por debajo del umbral, con cifras y sin repetir", async () => {
    const GB = 1024 ** 3;
    const stats = (freeGb: number) => async () => ({ bsize: 4096, blocks: (75 * GB) / 4096, bavail: (freeGb * GB) / 4096 });
    expect(await runDiskSpaceJob(stats(15))).toMatchObject({ freePercent: 20, alerted: false });
    expect(await runDiskSpaceJob(stats(7.5))).toMatchObject({ freePercent: 10, freeGb: 7.5, totalGb: 75, alerted: true });
    expect(mockSendEmail.mock.calls[0][0].subject).toBe("[AdeTravel][alerta] Disco casi lleno: 10 % libre (7.5 GB de 75 GB)");
    expect(await runDiskSpaceJob(stats(7))).toMatchObject({ alerted: false });
  });
});

describe("registro de trabajos programados", () => {
  afterEach(() => {
    delete process.env.JOBS_ENABLED;
    jest.resetModules();
  });

  it("con JOBS_ENABLED=false no programa nada; por defecto programa también la alerta de disco", () => {
    process.env.JOBS_ENABLED = "false";
    jest.isolateModules(() => require("../../../src/jobs").registerJobs());
    expect(mockSchedule).not.toHaveBeenCalled();

    delete process.env.JOBS_ENABLED;
    jest.isolateModules(() => require("../../../src/jobs").registerJobs());
    expect(mockSchedule.mock.calls.map(([expr]: [string]) => expr)).toContain("*/30 * * * *");
  });
});
