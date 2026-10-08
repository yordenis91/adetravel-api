import express from "express";
import request from "supertest";
import { requestLogger } from "../../../src/middlewares/request-logger.middleware";
import { logger } from "../../../src/utils/logger";
import { currentRequestId } from "../../../src/utils/request-context";

describe("requestLogger", () => {
  const app = express();
  app.use(requestLogger);
  app.use((req, _res, next) => {
    if (req.get("x-test-user")) (req as any).user = { id: req.get("x-test-user"), email: "no@debe.salir" };
    next();
  });
  app.get("/api/clients", (_req, res) => res.json({ requestId: currentRequestId() }));
  app.get("/api/boom", (_req, res) => res.status(500).end());
  app.get("/health", (_req, res) => res.end());

  afterEach(() => jest.restoreAllMocks());

  it("devuelve X-Request-Id, lo comparte con el resto de la petición y registra sin query ni correo", async () => {
    const info = jest.spyOn(logger, "info");
    const res = await request(app).get("/api/clients?search=ana@b.cl").set("x-test-user", "u1");
    const id = res.headers["x-request-id"];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.requestId).toBe(id);
    const entry = info.mock.calls.find(([, msg]) => msg === "request")?.[0] as any;
    expect(entry).toMatchObject({ requestId: id, method: "GET", path: "/api/clients", status: 200, userId: "u1" });
    expect(JSON.stringify(entry)).not.toContain("ana@b.cl");
    expect(JSON.stringify(entry)).not.toContain("no@debe.salir");
  });

  it("respeta un X-Request-Id válido del proxy y rechaza uno inválido", async () => {
    const ok = await request(app).get("/api/clients").set("x-request-id", "proxy-abc-12345");
    expect(ok.headers["x-request-id"]).toBe("proxy-abc-12345");
    const bad = await request(app).get("/api/clients").set("x-request-id", "<script>");
    expect(bad.headers["x-request-id"]).not.toBe("<script>");
  });

  it("los 5xx van como error y el sondeo de salud solo en debug", async () => {
    const error = jest.spyOn(logger, "error");
    const debug = jest.spyOn(logger, "debug");
    await request(app).get("/api/boom");
    await request(app).get("/health");
    expect(error.mock.calls.some(([e]: any) => e.path === "/api/boom" && e.status === 500)).toBe(true);
    expect(debug.mock.calls.some(([e]: any) => e.path === "/health")).toBe(true);
  });
});
