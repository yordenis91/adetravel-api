import { buildLinkCode, computeLinkExpiry, detectDevice, isAutomatedClient, parseLinkCode, summarizeTracking } from "../../../src/services/quotation-link.service";

const ID = "3f2b8c1e-9a4d-4e7b-8c1a-5d6e7f809a1b";
const DAY = 86_400_000;

describe("código del enlace público", () => {
  it("ida y vuelta: del id al código y de vuelta al id; mide 75 caracteres y es seguro para URL", () => {
    const code = buildLinkCode(ID);
    expect(code).toHaveLength(75);
    expect(code).toMatch(/^[0-9a-f]{32}[A-Za-z0-9_-]{43}$/);
    expect(parseLinkCode(code)).toBe(ID);
  });

  it("es determinista (se puede volver a copiar) y distinto para cada id", () => {
    expect(buildLinkCode(ID)).toBe(buildLinkCode(ID));
    expect(buildLinkCode(ID)).not.toBe(buildLinkCode("3f2b8c1e-9a4d-4e7b-8c1a-5d6e7f809a1c"));
  });

  it("rechaza firmas manipuladas, cambios en el id, largos distintos y tipos raros", () => {
    const code = buildLinkCode(ID);
    const flipped = code.slice(0, -1) + (code.endsWith("A") ? "B" : "A");
    expect(parseLinkCode(flipped)).toBeNull();
    expect(parseLinkCode(`${"0".repeat(32)}${code.slice(32)}`)).toBeNull();
    expect(parseLinkCode(code + "x")).toBeNull();
    expect(parseLinkCode(code.slice(1))).toBeNull();
    expect(parseLinkCode("")).toBeNull();
    expect(parseLinkCode(undefined as unknown as string)).toBeNull();
    expect(parseLinkCode(`${"G".repeat(32)}${code.slice(32)}`)).toBeNull();
  });
});

describe("vencimiento del enlace", () => {
  const now = new Date("2026-10-19T12:00:00Z");

  it("vence 30 días después de la vigencia (al terminar ese día)", () => {
    expect(computeLinkExpiry("2026-12-01", now).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("si la cotización ya estaba vencida al enviar, da al menos 7 días", () => {
    const expiry = computeLinkExpiry("2020-01-01", now);
    expect(expiry.getTime() - now.getTime()).toBe(7 * DAY);
  });

  it("sin vigencia o con una fecha ilegible usa 60 días", () => {
    expect(computeLinkExpiry(null, now).getTime() - now.getTime()).toBe(60 * DAY);
    expect(computeLinkExpiry("pronto", now).getTime() - now.getTime()).toBe(60 * DAY);
  });
});

describe("clientes automáticos y dispositivos", () => {
  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "WhatsApp/2.23.20.0 A",
    "facebookexternalhit/1.1",
    "Slackbot-LinkExpanding 1.0",
    "curl/8.4.0",
    "python-requests/2.31",
    "Mozilla/5.0 HeadlessChrome/120.0 Safari/537.36",
    "Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0; Pro)  SafeLinks Protection",
    "",
  ])("%s se ignora", (ua) => expect(isAutomatedClient(ua)).toBe(true));

  it.each([
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  ])("un navegador normal cuenta: %s", (ua) => expect(isAutomatedClient(ua)).toBe(false));

  it("distingue móvil, tableta y escritorio", () => {
    expect(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148")).toBe("mobile");
    expect(detectDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile Safari/537.36")).toBe("mobile");
    expect(detectDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
    expect(detectDevice("Mozilla/5.0 (Linux; Android 13; SM-X700) Chrome/130 Safari/537.36")).toBe("tablet");
    expect(detectDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36")).toBe("desktop");
    expect(detectDevice(undefined)).toBe("desktop");
  });
});

describe("resumen de seguimiento", () => {
  const base = { createdAt: new Date("2026-10-01"), expiresAt: new Date(Date.now() + DAY), revokedAt: null, viewCount: 0, firstViewedAt: null, lastViewedAt: null, acceptanceRequestedAt: null };

  it("sin enlaces vigentes: hasLink false y ceros", () => {
    expect(summarizeTracking([])).toMatchObject({ hasLink: false, viewCount: 0 });
    expect(summarizeTracking(undefined)).toMatchObject({ hasLink: false });
    expect(summarizeTracking([{ ...base, revokedAt: new Date() }])).toMatchObject({ hasLink: false });
    expect(summarizeTracking([{ ...base, expiresAt: new Date(Date.now() - 1000) }])).toMatchObject({ hasLink: false });
  });

  it("usa el enlace vigente más reciente", () => {
    const seen = new Date("2026-10-05");
    const summary = summarizeTracking([
      { ...base, viewCount: 9 },
      { ...base, createdAt: new Date("2026-10-10"), viewCount: 2, firstViewedAt: seen, lastViewedAt: seen },
    ]);
    expect(summary).toMatchObject({ hasLink: true, viewCount: 2, firstViewedAt: seen });
  });
});
