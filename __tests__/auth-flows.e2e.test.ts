// Flujos de autenticación contra Postgres real: inicio de sesión, perfil, cambio de contraseña,
// invitación y recuperación de contraseña. Requiere Postgres migrado (npm run test:e2e).
process.env.RATE_LIMIT_MAX = "100000";
process.env.EMAIL_DELIVERY = "off"; // ningún correo sale de la prueba

jest.mock("../src/services/pdf.service", () => ({}));

import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require("../src/config/env");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../src/lib/prisma");

const tag = `af${process.pid}${Date.now()}`;

type TestUser = { id: string; email: string; fullName: string; role: string; tokenVersion?: number };
const PASSWORD = "Inicial-2026!";
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

describe("autenticación (integración con Postgres)", () => {
  const users: Record<string, TestUser> = {};
  const createdEmails: string[] = [];

  const mkUser = async (key: string, data: Record<string, unknown> = {}) => {
    const email = `${tag}-${key}@example.com`;
    users[key] = await prisma.user.create({
      data: { email, fullName: `Usuario ${key}`, passwordHash: await bcrypt.hash(PASSWORD, 4), role: "USUARIO", ...data },
    });
    return users[key];
  };
  const tokenOf = (u: TestUser, extra: Record<string, unknown> = {}, options: jwt.SignOptions = {}) =>
    jwt.sign({ id: u.id, email: u.email, role: u.role, tv: u.tokenVersion ?? 0, ...extra }, env.JWT_SECRET, options);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = (email: string, password: string) => request(app).post("/api/auth/login").send({ email, password });

  beforeAll(async () => {
    await mkUser("admin", { role: "ADMINISTRADOR" });
    await mkUser("plain");
    await mkUser("inactive", { isActive: false });
    await mkUser("pw"); // cambia su contraseña
    await mkUser("reset"); // recuperación de contraseña
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: `${tag}-` } } });
    await prisma.$disconnect();
  });

  describe("registro", () => {
    it("está deshabilitado por defecto", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ fullName: "Nuevo Usuario", email: `${tag}-reg@example.com`, password: PASSWORD, confirmPassword: PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("REGISTRATION_DISABLED");
    });
  });

  describe("inicio de sesión", () => {
    it("devuelve token, usuario sin hash y permisos", async () => {
      const res = await login(users.admin.email, PASSWORD);
      expect(res.status).toBe(200);
      expect(res.body.data.token).toEqual(expect.any(String));
      expect(res.body.data.user.email).toBe(users.admin.email);
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(Array.isArray(res.body.data.user.permissions)).toBe(true);
      expect(res.body.data.user.permissions.length).toBeGreaterThan(0);
    });

    it("no distingue mayúsculas en el correo", async () => {
      const res = await login(users.plain.email.toUpperCase(), PASSWORD);
      expect(res.status).toBe(200);
    });

    it("contraseña incorrecta y correo inexistente dan el mismo error (no revela cuál falló)", async () => {
      const wrong = await login(users.plain.email, "Otra-Clave-1!");
      const unknown = await login(`${tag}-nadie@example.com`, PASSWORD);
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body.code).toBe("INVALID_CREDENTIALS");
      expect(unknown.body.code).toBe("INVALID_CREDENTIALS");
      expect(wrong.body.error).toBe(unknown.body.error);
    });

    it("una cuenta desactivada no entra", async () => {
      const res = await login(users.inactive.email, PASSWORD);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("USER_INACTIVE");
    });

    it("rechaza el cuerpo mal formado antes de tocar la base", async () => {
      const res = await request(app).post("/api/auth/login").send({ email: "no-es-correo", password: "x" });
      expect(res.status).toBe(400);
    });
  });

  describe("sesión y perfil", () => {
    it("GET /me devuelve el perfil con permisos", async () => {
      const res = await request(app).get("/api/auth/me").set(auth(tokenOf(users.plain)));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: users.plain.id, email: users.plain.email });
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(Array.isArray(res.body.data.permissions)).toBe(true);
    });

    it("sin token: 401 NO_TOKEN", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("NO_TOKEN");
    });

    it("token mal firmado: 401 INVALID_TOKEN", async () => {
      const res = await request(app).get("/api/auth/me").set(auth("esto.no.es-un-token"));
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_TOKEN");
    });

    it("token caducado: 401 TOKEN_EXPIRED", async () => {
      const res = await request(app).get("/api/auth/me").set(auth(tokenOf(users.plain, {}, { expiresIn: -10 })));
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("TOKEN_EXPIRED");
    });

    it("un usuario desactivado después de iniciar sesión pierde el acceso", async () => {
      const token = tokenOf(users.inactive);
      const res = await request(app).get("/api/auth/me").set(auth(token));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("USER_INACTIVE");
    });

    it("PATCH /me actualiza el nombre sin tocar la contraseña", async () => {
      const res = await request(app)
        .patch("/api/auth/me")
        .set(auth(tokenOf(users.plain)))
        .send({ fullName: "Nombre Cambiado" });
      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe("Nombre Cambiado");
      expect(res.body.data.token).toBeUndefined(); // sin cambio de contraseña no se emite token nuevo
    });
  });

  describe("cambio de contraseña desde el perfil", () => {
    const NEW = "Nueva-Clave-2026!";

    it("exige la contraseña actual", async () => {
      const res = await request(app).patch("/api/auth/me").set(auth(tokenOf(users.pw))).send({ newPassword: NEW });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("CURRENT_PASSWORD_REQUIRED");
    });

    it("rechaza una contraseña actual incorrecta", async () => {
      const res = await request(app)
        .patch("/api/auth/me")
        .set(auth(tokenOf(users.pw)))
        .send({ currentPassword: "Incorrecta-1!", newPassword: NEW });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("WRONG_PASSWORD");
    });

    it("rechaza una contraseña nueva que no cumple la política", async () => {
      const res = await request(app)
        .patch("/api/auth/me")
        .set(auth(tokenOf(users.pw)))
        .send({ currentPassword: PASSWORD, newPassword: "debil" });
      expect(res.status).toBe(400);
    });

    it("cambia la contraseña, invalida la sesión anterior y entrega un token nuevo", async () => {
      const oldToken = tokenOf(users.pw);
      const res = await request(app)
        .patch("/api/auth/me")
        .set(auth(oldToken))
        .send({ currentPassword: PASSWORD, newPassword: NEW });
      expect(res.status).toBe(200);
      const newToken = res.body.data.token as string;
      expect(newToken).toEqual(expect.any(String));

      expect((await request(app).get("/api/auth/me").set(auth(oldToken))).status).toBe(401);
      expect((await request(app).get("/api/auth/me").set(auth(newToken))).status).toBe(200);
      expect((await login(users.pw.email, PASSWORD)).status).toBe(401);
      expect((await login(users.pw.email, NEW)).status).toBe(200);
    });
  });

  describe("invitación de usuarios", () => {
    it("quien no tiene MANAGE_USERS recibe 403", async () => {
      const res = await request(app)
        .post("/api/auth/invite")
        .set(auth(tokenOf(users.plain)))
        .send({ email: `${tag}-inv0@example.com`, fullName: "Invitado Cero", role: "USUARIO", password: PASSWORD });
      expect(res.status).toBe(403);
    });

    it("el administrador invita: normaliza el correo y no envía nada con EMAIL_DELIVERY=off", async () => {
      const email = `${tag}-INV1@Example.com`;
      createdEmails.push(email.toLowerCase());
      const res = await request(app)
        .post("/api/auth/invite")
        .set(auth(tokenOf(users.admin)))
        .send({ email, fullName: "Invitado Uno", role: "USUARIO", agencyRole: "OPERACIONES", password: PASSWORD });
      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe(email.toLowerCase());
      expect(res.body.data).not.toHaveProperty("passwordHash");

      const stored = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      expect(stored.agencyRole).toBe("OPERACIONES");
      // Queda un enlace de un solo uso guardado como hash, que vence en unos 7 días.
      expect(stored.resetPasswordToken).toMatch(/^[0-9a-f]{64}$/);
      const days = (stored.resetPasswordExpires.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);
    });

    it("no permite invitar dos veces el mismo correo", async () => {
      const res = await request(app)
        .post("/api/auth/invite")
        .set(auth(tokenOf(users.admin)))
        .send({ email: users.plain.email, fullName: "Repetido Uno", role: "USUARIO", password: PASSWORD });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("USER_ALREADY_EXISTS");
    });

    it("rechaza una contraseña de respaldo que no cumple la política", async () => {
      const res = await request(app)
        .post("/api/auth/invite")
        .set(auth(tokenOf(users.admin)))
        .send({ email: `${tag}-inv2@example.com`, fullName: "Invitado Dos", role: "USUARIO", password: "debil" });
      expect(res.status).toBe(400);
    });
  });

  describe("recuperación de contraseña", () => {
    const RAW = crypto.randomBytes(32).toString("hex");
    const NEW = "Recuperada-2026!";

    it("forgot-password responde igual exista o no el correo (no permite enumerar usuarios)", async () => {
      const unknown = await request(app).post("/api/auth/forgot-password").send({ email: `${tag}-fantasma@example.com` });
      const known = await request(app).post("/api/auth/forgot-password").send({ email: users.reset.email });
      expect(unknown.status).toBe(200);
      expect(known.status).toBe(200);
      expect(known.body).toEqual(unknown.body);

      // Para el usuario real queda un token (solo su hash) que vence en una hora.
      const stored = await prisma.user.findUnique({ where: { id: users.reset.id } });
      expect(stored.resetPasswordToken).toMatch(/^[0-9a-f]{64}$/);
      const minutes = (stored.resetPasswordExpires.getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(55);
      expect(minutes).toBeLessThan(61);
    });

    it("forgot-password sin correo: 400 MISSING_EMAIL", async () => {
      const res = await request(app).post("/api/auth/forgot-password").send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("MISSING_EMAIL");
    });

    it("validate-reset-token: acepta uno vigente, rechaza uno inexistente y uno vencido", async () => {
      await prisma.user.update({
        where: { id: users.reset.id },
        data: { resetPasswordToken: sha256(RAW), resetPasswordExpires: new Date(Date.now() + 3_600_000) },
      });
      const ok = await request(app).post("/api/auth/validate-reset-token").send({ token: RAW });
      expect(ok.status).toBe(200);
      expect(ok.body.data.valid).toBe(true);

      const bad = await request(app).post("/api/auth/validate-reset-token").send({ token: "inexistente" });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe("INVALID_TOKEN");

      await prisma.user.update({ where: { id: users.reset.id }, data: { resetPasswordExpires: new Date(Date.now() - 1000) } });
      const expired = await request(app).post("/api/auth/validate-reset-token").send({ token: RAW });
      expect(expired.status).toBe(400);
      expect(expired.body.code).toBe("INVALID_TOKEN");
    });

    it("reset-password: rechaza una contraseña débil, restablece con una buena y el token no se reutiliza", async () => {
      await prisma.user.update({
        where: { id: users.reset.id },
        data: { resetPasswordToken: sha256(RAW), resetPasswordExpires: new Date(Date.now() + 3_600_000) },
      });
      const sessionBefore = tokenOf(await prisma.user.findUnique({ where: { id: users.reset.id } }));

      const weak = await request(app).post("/api/auth/reset-password").send({ token: RAW, newPassword: "debil" });
      expect(weak.status).toBe(400);
      expect(weak.body.code).toBe("WEAK_PASSWORD");

      const ok = await request(app).post("/api/auth/reset-password").send({ token: RAW, newPassword: NEW });
      expect(ok.status).toBe(200);
      expect(ok.body.data.success).toBe(true);

      expect((await login(users.reset.email, NEW)).status).toBe(200);
      expect((await login(users.reset.email, PASSWORD)).status).toBe(401);
      // Las sesiones abiertas antes del restablecimiento se cierran.
      expect((await request(app).get("/api/auth/me").set(auth(sessionBefore))).status).toBe(401);
      // El enlace es de un solo uso.
      const reuse = await request(app).post("/api/auth/reset-password").send({ token: RAW, newPassword: NEW });
      expect(reuse.status).toBe(400);
      expect(reuse.body.code).toBe("INVALID_TOKEN");
    });
  });

  describe("cierre de sesión", () => {
    it("el token ya no sirve después de salir", async () => {
      const { body } = await login(users.admin.email, PASSWORD);
      const token = body.data.token as string;
      expect((await request(app).post("/api/auth/logout").set(auth(token))).status).toBe(200);
      expect((await request(app).get("/api/auth/me").set(auth(token))).status).toBe(401);
    });
  });
});
