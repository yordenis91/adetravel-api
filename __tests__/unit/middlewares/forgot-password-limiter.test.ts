import express from "express";
import request from "supertest";

describe("forgotPasswordLimiter", () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAIL;
    jest.resetModules();
  });

  function appWithLimiter() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { forgotPasswordLimiter } = require("../../../src/middlewares/rate-limit.middleware");
    const app = express();
    app.use(express.json());
    app.post("/forgot-password", forgotPasswordLimiter, (_req, res) => res.json({ ok: true }));
    return app;
  }

  it.each([
    ["el correo del administrador", { email: "admin@example.com" }],
    ["un cuerpo sin correo", {}],
  ])("limita a 5 por hora también con %s", async (_caso, body) => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    const app = appWithLimiter();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await request(app).post("/forgot-password").send(body)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});
