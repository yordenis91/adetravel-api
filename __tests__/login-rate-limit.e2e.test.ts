// Límite propio de POST /api/auth/login (loginLimiter). Requiere Postgres migrado.
// Los valores se fijan antes de cargar la app para que env.ts los lea.
process.env.LOGIN_RATE_LIMIT_MAX = "3";
process.env.RATE_LIMIT_MAX = "1000";

jest.mock("../src/services/pdf.service", () => ({}));

import bcrypt from "bcryptjs";
import request from "supertest";

const tag = `rl-${Date.now()}`;
const email = `${tag}@example.com`;
const PASSWORD = "Correcta-123456";

describe("límite de login (integración con Postgres)", () => {
  let app: any;
  let prisma: any;
  let userId: string;

  beforeAll(async () => {
    ({ app } = require("../src/app"));
    ({ prisma } = require("../src/lib/prisma"));
    const user = await prisma.user.create({
      data: { email, fullName: "Límite Prueba", passwordHash: await bcrypt.hash(PASSWORD, 4), role: "USUARIO" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  // trust proxy = 1: cada X-Forwarded-For es una "IP" distinta con su propio contador.
  const login = (ip: string, password: string) =>
    request(app).post("/api/auth/login").set("X-Forwarded-For", ip).send({ email, password });

  it("bloquea con 429 tras LOGIN_RATE_LIMIT_MAX intentos fallidos desde la misma IP", async () => {
    const ip = "10.0.0.1";
    for (let i = 0; i < 3; i++) expect((await login(ip, "Incorrecta-123456")).status).toBe(401);
    const blocked = await login(ip, "Incorrecta-123456");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["ratelimit"] ?? blocked.headers["ratelimit-limit"]).toBeDefined();
  });

  it("una IP bloqueada no puede entrar ni con la contraseña correcta", async () => {
    expect((await login("10.0.0.1", PASSWORD)).status).toBe(429);
  });

  it("otra IP no se ve afectada por el bloqueo", async () => {
    expect((await login("10.0.0.2", PASSWORD)).status).toBe(200);
  });

  it("los inicios de sesión correctos no consumen el límite", async () => {
    const ip = "10.0.0.3";
    for (let i = 0; i < 8; i++) expect((await login(ip, PASSWORD)).status).toBe(200);
    expect((await login(ip, "Incorrecta-123456")).status).toBe(401);
  });

  it("los fallos y los éxitos se cuentan por separado: éxitos intercalados no reinician el contador de fallos", async () => {
    const ip = "10.0.0.4";
    expect((await login(ip, "Incorrecta-123456")).status).toBe(401);
    expect((await login(ip, PASSWORD)).status).toBe(200);
    expect((await login(ip, "Incorrecta-123456")).status).toBe(401);
    expect((await login(ip, "Incorrecta-123456")).status).toBe(401);
    expect((await login(ip, "Incorrecta-123456")).status).toBe(429);
  });

  it("las peticiones con cuerpo inválido (400) también cuentan como fallidas", async () => {
    const ip = "10.0.0.5";
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post("/api/auth/login").set("X-Forwarded-For", ip).send({})).status).toBe(400);
    }
    expect((await login(ip, PASSWORD)).status).toBe(429);
  });
});
