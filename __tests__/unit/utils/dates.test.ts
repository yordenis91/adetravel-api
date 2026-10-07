import { isExpired, todayISO } from "../../../src/utils/dates";

describe("dates", () => {
  // 2026-10-08 02:30 UTC todavía es 7 de octubre en Chile (UTC-3 por horario de verano).
  const now = new Date("2026-10-08T02:30:00Z");

  it("todayISO usa la zona horaria de la agencia, no la del servidor", () => {
    expect(todayISO("America/Santiago", now)).toBe("2026-10-07");
    expect(todayISO("UTC", now)).toBe("2026-10-08");
  });

  it("una cotización vence al día siguiente de su fecha de validez", () => {
    expect(isExpired("2026-10-07", "America/Santiago", now)).toBe(false);
    expect(isExpired("2026-10-06", "America/Santiago", now)).toBe(true);
  });

  it("sin fecha de validez no vence", () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired(undefined)).toBe(false);
  });
});
