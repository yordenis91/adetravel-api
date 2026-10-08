import { Writable } from "stream";
import { maskText, scrub, pathWithoutQuery, REDACTED } from "../../../src/utils/pii-scrub";
import { createLogger } from "../../../src/utils/logger";
import { requestContext } from "../../../src/utils/request-context";
import { scrubSentryEvent, scrubSentryBreadcrumb } from "../../../src/utils/sentry-scrub";

function captureLogger() {
  const lines: any[] = [];
  const destination = new Writable({
    write(chunk, _enc, cb) {
      lines.push(JSON.parse(chunk.toString()));
      cb();
    },
  });
  return { log: createLogger({ level: "debug", destination }), lines };
}

describe("filtrado de datos personales en logs", () => {
  it("enmascara correos, RUT y tokens en texto libre", () => {
    expect(maskText("Fallo al enviar a ana.perez@cliente.cl (RUT 12.345.678-K) con Bearer eyJabc.def")).toBe(
      "Fallo al enviar a [correo] (RUT [rut]) con Bearer [token]"
    );
  });

  it("filtra claves sensibles a cualquier profundidad y respeta ids", () => {
    const out = scrub({
      userId: "u1",
      body: { email: "a@b.cl", password: "x", passport_number: "P1", nested: { phone: "+569", to: ["a@b.cl"] } },
      note: "contacto a@b.cl",
    });
    expect(out).toEqual({
      userId: "u1",
      body: { email: REDACTED, password: REDACTED, passport_number: REDACTED, nested: { phone: REDACTED, to: REDACTED } },
      note: "contacto [correo]",
    });
  });

  it("no se cuelga con ciclos y convierte errores anidados en objetos seguros", () => {
    const a: any = { name: "a" };
    a.self = a;
    expect(scrub(a)).toEqual({ name: "a", self: "[ciclo]" });
    const out: any = scrub({ result: { error: new Error("rechazado para x@y.cl") } });
    expect(out.result.error).toMatchObject({ type: "Error", message: "rechazado para [correo]" });
  });

  it("quita la query de las rutas", () => {
    expect(pathWithoutQuery("/api/clients?search=ana@b.cl&page=1")).toBe("/api/clients");
    expect(pathWithoutQuery("/api/clients")).toBe("/api/clients");
  });

  it("el logger escribe JSON sin datos personales y con el requestId de la petición", () => {
    const { log, lines } = captureLogger();
    requestContext.run({ requestId: "req-12345678" }, () => {
      log.error({ err: new Error("SMTP rechazó a ana@cliente.cl"), to: "ana@cliente.cl", clientId: "c1" }, "Correo a ana@cliente.cl falló");
    });
    log.info({ user: { id: "u1", email: "x@y.cl" } }, "fuera de petición");

    expect(lines[0]).toMatchObject({
      service: "adetravel-api",
      requestId: "req-12345678",
      to: REDACTED,
      clientId: "c1",
      msg: "Correo a [correo] falló",
      err: { type: "Error", message: "SMTP rechazó a [correo]" },
    });
    expect(JSON.stringify(lines)).not.toContain("cliente.cl");
    expect(lines[1]).not.toHaveProperty("requestId");
    expect(lines[1].user).toEqual({ id: "u1", email: REDACTED });
  });
});

describe("filtrado de datos personales en Sentry", () => {
  it("deja solo método, ruta y cabeceras técnicas de la petición, y el id del usuario", () => {
    const event: any = scrubSentryEvent({
      message: "Error con ana@b.cl",
      request: {
        url: "https://api/x/clients?search=ana",
        method: "POST",
        data: { email: "ana@b.cl" },
        cookies: { s: "1" },
        query_string: "search=ana",
        headers: { authorization: "Bearer abc", "user-agent": "UA", cookie: "s=1" },
      },
      user: { id: "u1", email: "ana@b.cl", ip_address: "1.2.3.4" },
      exception: { values: [{ value: "duplicado ana@b.cl", stacktrace: { frames: [{ vars: { body: { email: "ana@b.cl" } } }] } }] },
      extra: { payload: { phone: "+569" } },
    } as any);
    expect(event.request).toEqual({ url: "https://api/x/clients", method: "POST", headers: { "user-agent": "UA" } });
    expect(event.user).toEqual({ id: "u1" });
    expect(event.message).toBe("Error con [correo]");
    expect(event.exception.values[0].value).toBe("duplicado [correo]");
    expect(event.exception.values[0].stacktrace.frames[0].vars).toBeUndefined();
    expect(event.extra).toEqual({ payload: { phone: REDACTED } });
  });

  it("limpia las migas: URL sin query y datos filtrados", () => {
    expect(scrubSentryBreadcrumb({ message: "GET a@b.cl", data: { url: "/api/x?q=a@b.cl", to: "a@b.cl" } })).toEqual({
      message: "GET [correo]",
      data: { url: "/api/x", to: REDACTED },
    });
  });
});
