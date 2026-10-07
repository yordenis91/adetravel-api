// Interacción entre el límite global de /api y el de login.
process.env.RATE_LIMIT_MAX = "5";
process.env.LOGIN_RATE_LIMIT_MAX = "10";

jest.mock("../src/services/pdf.service", () => ({}));

import bcrypt from "bcryptjs";
import request from "supertest";

const tag = `rlg-${Date.now()}`;
const email = `${tag}@example.com`;
const PASSWORD = "Correcta-123456";

describe("límite global vs login (integración con Postgres)", () => {
  let app: any;
  let prisma: any;
  let userId: string;

  beforeAll(async () => {
    ({ app } = require("../src/app"));
    ({ prisma } = require("../src/lib/prisma"));
    const user = await prisma.user.create({
      data: { email, fullName: "Global Prueba", passwordHash: await bcrypt.hash(PASSWORD, 4), role: "USUARIO" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("/health no consume el límite global", async () => {
    for (let i = 0; i < 10; i++) expect((await request(app).get("/health").set("X-Forwarded-For", "10.1.0.1")).status).toBe(200);
  });

  // El limitador global de app.ts corre antes que el router de auth: sin el `skip` de login,
  // /auth/login compartiría el cupo global (RATE_LIMIT_MAX) y devolvería 429 tras el polling.
  it("tras agotar el límite global con otras rutas (p. ej. polling), el login de esa IP sigue funcionando", async () => {
    const ip = "10.1.0.2";
    for (let i = 0; i < 5; i++) await request(app).get("/api/notifications").set("X-Forwarded-For", ip);
    const res = await request(app).post("/api/auth/login").set("X-Forwarded-For", ip).send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
  });
});
