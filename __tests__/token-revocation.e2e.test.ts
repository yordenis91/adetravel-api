// Revocación de sesiones persistida en la base. Requiere Postgres migrado (npm run test:e2e).
jest.mock("../src/services/pdf.service", () => ({}));

import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";

const tag = `tok-${Date.now()}`;
const email = `${tag}@example.com`;
const PASSWORD = "Inicial-2026!";

describe("revocación de sesiones (integración con Postgres)", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email, fullName: "Tokens Prueba", passwordHash: await bcrypt.hash(PASSWORD, 4), role: "USUARIO" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const login = async (password: string) => {
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    return res.body.data.token as string;
  };
  const me = (token: string) => request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

  it("los tokens nuevos llevan jti y versión", async () => {
    const payload = jwt.decode(await login(PASSWORD)) as jwt.JwtPayload;
    expect(payload.jti).toBeDefined();
    expect(payload.tv).toBe(0);
  });

  it("logout revoca ese token en la base (sobrevive a un reinicio) y no afecta a otra sesión", async () => {
    const a = await login(PASSWORD);
    const b = await login(PASSWORD);
    expect((await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${a}`)).status).toBe(200);

    const { jti } = jwt.decode(a) as jwt.JwtPayload;
    expect(await prisma.revokedToken.findUnique({ where: { jti: jti! } })).not.toBeNull();
    expect((await me(a)).status).toBe(401);
    expect((await me(b)).status).toBe(200);
  });

  it("cambiar la contraseña cierra las demás sesiones y devuelve un token nuevo que funciona", async () => {
    const other = await login(PASSWORD);
    const current = await login(PASSWORD);
    const res = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${current}`)
      .send({ currentPassword: PASSWORD, newPassword: "Cambiada-2026!" });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data).not.toHaveProperty("tokenVersion");

    expect((await me(other)).status).toBe(401);
    expect((await me(current)).status).toBe(401);
    expect((await me(res.body.data.token)).status).toBe(200);
  });

  it("restablecer la contraseña cierra todas las sesiones", async () => {
    const session = await login("Cambiada-2026!");
    const resetToken = crypto.randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { id: userId },
      data: {
        resetPasswordToken: crypto.createHash("sha256").update(resetToken).digest("hex"),
        resetPasswordExpires: new Date(Date.now() + 60_000),
      },
    });
    const res = await request(app).post("/api/auth/reset-password").send({ token: resetToken, newPassword: "Reset-2026!" });
    expect(res.status).toBe(200);
    expect((await me(session)).status).toBe(401);
    expect((await me(await login("Reset-2026!"))).status).toBe(200);
  });

  it("un token antiguo (sin jti ni versión) vale hasta el primer cambio de contraseña", async () => {
    const fresh = await prisma.user.create({
      data: { email: `${tag}-old@example.com`, fullName: "Antiguo", passwordHash: await bcrypt.hash(PASSWORD, 4), role: "USUARIO" },
    });
    const legacy = jwt.sign({ id: fresh.id, email: fresh.email, role: fresh.role }, env.JWT_SECRET, { expiresIn: "1h" });
    expect((await me(legacy)).status).toBe(200);
    await prisma.user.update({ where: { id: fresh.id }, data: { tokenVersion: { increment: 1 } } });
    expect((await me(legacy)).status).toBe(401);
    await prisma.user.delete({ where: { id: fresh.id } });
  });

  it("guardar el perfil sin cambiar la contraseña no cierra la sesión ni devuelve token", async () => {
    const token = await login("Reset-2026!");
    const res = await request(app).patch("/api/auth/me").set("Authorization", `Bearer ${token}`).send({ fullName: "Otro Nombre" });
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty("token");
    expect((await me(token)).status).toBe(200);
  });
});
