// Gestión de usuarios contra Postgres real: permisos, listado, edición con sus protecciones y baja.
// Requiere Postgres migrado (npm run test:e2e).
process.env.RATE_LIMIT_MAX = "100000";
process.env.EMAIL_DELIVERY = "off";

jest.mock("../src/services/pdf.service", () => ({}));

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require("../src/config/env");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../src/lib/prisma");

const tag = `um${process.pid}${Date.now()}`;
const PASSWORD = "Inicial-2026!";

describe("gestión de usuarios (integración con Postgres)", () => {
  const u: Record<string, any> = {};

  const mk = async (key: string, data: Record<string, unknown> = {}) => {
    u[key] = await prisma.user.create({
      data: { email: `${tag}-${key}@example.com`, fullName: `Gestión ${key}`, passwordHash: await bcrypt.hash(PASSWORD, 4), role: "USUARIO", ...data },
    });
  };
  const as = (user: any) => ({
    Authorization: `Bearer ${jwt.sign({ id: user.id, email: user.email, role: user.role, tv: user.tokenVersion ?? 0 }, env.JWT_SECRET)}`,
  });

  beforeAll(async () => {
    await mk("admin", { role: "ADMINISTRADOR" });
    await mk("plain");
    await mk("target", { agencyRole: "OPERACIONES" });
    await mk("other");
    await mk("gone");
  });

  afterAll(async () => {
    await prisma.activityLog.deleteMany({ where: { entityId: { in: Object.values(u).map((x: any) => x.id) } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: `${tag}-` } } });
    await prisma.$disconnect();
  });

  describe("permisos", () => {
    it.each([
      ["GET", "/api/users"],
      ["GET", "/api/users/stats"],
    ])("%s %s exige VIEW_USERS", async (_m, path) => {
      expect((await request(app).get(path).set(as(u.plain))).status).toBe(403);
    });

    it("editar y borrar exigen MANAGE_USERS", async () => {
      expect((await request(app).patch(`/api/users/${u.target.id}`).set(as(u.plain)).send({ isActive: false })).status).toBe(403);
      expect((await request(app).delete(`/api/users/${u.target.id}`).set(as(u.plain))).status).toBe(403);
    });

    it("sin sesión: 401", async () => {
      expect((await request(app).get("/api/users")).status).toBe(401);
    });
  });

  describe("consulta", () => {
    it("lista con paginación y sin exponer el hash de la contraseña", async () => {
      const res = await request(app).get(`/api/users?search=${tag}&limit=2&page=1`).set(as(u.admin));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBeGreaterThanOrEqual(5);
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("filtra por rol de agencia y por estado", async () => {
      const byRole = await request(app).get(`/api/users?search=${tag}&agencyRole=OPERACIONES`).set(as(u.admin));
      expect(byRole.body.data.map((x: any) => x.id)).toEqual([u.target.id]);

      await prisma.user.update({ where: { id: u.other.id }, data: { isActive: false } });
      const inactive = await request(app).get(`/api/users?search=${tag}&isActive=false`).set(as(u.admin));
      expect(inactive.body.data.map((x: any) => x.id)).toEqual([u.other.id]);
      await prisma.user.update({ where: { id: u.other.id }, data: { isActive: true } });
    });

    it("estadísticas: total y administradores", async () => {
      const res = await request(app).get("/api/users/stats").set(as(u.admin));
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBeGreaterThanOrEqual(5);
      expect(res.body.data.administradores).toBeGreaterThanOrEqual(1);
    });

    it("GET /:id devuelve el usuario; uno inexistente, 404", async () => {
      const ok = await request(app).get(`/api/users/${u.target.id}`).set(as(u.admin));
      expect(ok.status).toBe(200);
      expect(ok.body.data.email).toBe(u.target.email);
      expect(ok.body.data.passwordHash).toBeUndefined();
      const missing = await request(app).get("/api/users/00000000-0000-4000-8000-000000000000").set(as(u.admin));
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe("USER_NOT_FOUND");
    });

    it("un id que no es un UUID se rechaza antes de consultar la base", async () => {
      expect((await request(app).get("/api/users/no-es-un-id").set(as(u.admin))).status).toBe(400);
    });
  });

  describe("edición", () => {
    it("el administrador cambia el rol de agencia de otro usuario y queda en la bitácora", async () => {
      const res = await request(app).patch(`/api/users/${u.target.id}`).set(as(u.admin)).send({ agencyRole: "FINANZAS" });
      expect(res.status).toBe(200);
      expect(res.body.data.agencyRole).toBe("FINANZAS");
      const log = await prisma.activityLog.findFirst({ where: { entityType: "User", entityId: u.target.id, action: "UPDATE" } });
      expect(log).not.toBeNull();
      expect(log.performedBy).toBe(u.admin.id);
    });

    it("no puede cambiarse el propio rol", async () => {
      const res = await request(app).patch(`/api/users/${u.admin.id}`).set(as(u.admin)).send({ role: "USUARIO" });
      expect(res.status).toBe(403);
      expect((await prisma.user.findUnique({ where: { id: u.admin.id } })).role).toBe("ADMINISTRADOR");
    });

    it("no puede desactivar su propia cuenta", async () => {
      const res = await request(app).patch(`/api/users/${u.admin.id}`).set(as(u.admin)).send({ isActive: false });
      expect(res.status).toBe(403);
      expect((await prisma.user.findUnique({ where: { id: u.admin.id } })).isActive).toBe(true);
    });

    it("solo acepta los campos del esquema: no se puede colar un hash ni la versión de token", async () => {
      const before = await prisma.user.findUnique({ where: { id: u.target.id } });
      const res = await request(app)
        .patch(`/api/users/${u.target.id}`)
        .set(as(u.admin))
        .send({ passwordHash: "x", tokenVersion: 99, isActive: true });
      expect(res.status).toBe(200);
      const after = await prisma.user.findUnique({ where: { id: u.target.id } });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.tokenVersion).toBe(before.tokenVersion);
    });

    it("cambia el correo (en minúsculas) y rechaza uno que ya usa otro usuario", async () => {
      const taken = await request(app).patch(`/api/users/${u.target.id}`).set(as(u.admin)).send({ email: u.plain.email });
      expect(taken.status).toBe(409);
      expect(taken.body.code).toBe("EMAIL_ALREADY_EXISTS");

      const ok = await request(app).patch(`/api/users/${u.target.id}`).set(as(u.admin)).send({ email: `${tag}-NUEVO@Example.com` });
      expect(ok.status).toBe(200);
      expect(ok.body.data.email).toBe(`${tag}-nuevo@example.com`);
    });

    it("el administrador restablece la contraseña de otro usuario: se guarda cifrada y sirve para entrar", async () => {
      const NEW = "Reasignada-2026!";
      const res = await request(app).patch(`/api/users/${u.target.id}`).set(as(u.admin)).send({ password: NEW });
      expect(res.status).toBe(200);
      const stored = await prisma.user.findUnique({ where: { id: u.target.id } });
      expect(stored.passwordHash).not.toBe(NEW);
      const email = stored.email;
      expect((await request(app).post("/api/auth/login").send({ email, password: NEW })).status).toBe(200);
      expect((await request(app).post("/api/auth/login").send({ email, password: PASSWORD })).status).toBe(401);
    });

    it("rechaza una contraseña que no cumple la política", async () => {
      const res = await request(app).patch(`/api/users/${u.target.id}`).set(as(u.admin)).send({ password: "debil" });
      expect(res.status).toBe(400);
    });

    it("rechaza un rol inválido", async () => {
      const res = await request(app).patch(`/api/users/${u.target.id}`).set(as(u.admin)).send({ role: "SUPERUSUARIO" });
      expect(res.status).toBe(400);
    });

    it("editar un usuario inexistente: 404", async () => {
      const res = await request(app).patch("/api/users/00000000-0000-4000-8000-000000000000").set(as(u.admin)).send({ isActive: true });
      expect(res.status).toBe(404);
    });

    it("desactivar a alguien le corta el acceso con su sesión actual", async () => {
      const headers = as(u.other);
      expect((await request(app).get("/api/auth/me").set(headers)).status).toBe(200);
      await request(app).patch(`/api/users/${u.other.id}`).set(as(u.admin)).send({ isActive: false });
      const res = await request(app).get("/api/auth/me").set(headers);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("USER_INACTIVE");
    });
  });

  describe("baja", () => {
    it("no puede eliminar su propia cuenta", async () => {
      expect((await request(app).delete(`/api/users/${u.admin.id}`).set(as(u.admin))).status).toBe(403);
      expect(await prisma.user.findUnique({ where: { id: u.admin.id } })).not.toBeNull();
    });

    it("el administrador elimina a otro usuario y queda en la bitácora", async () => {
      const res = await request(app).delete(`/api/users/${u.gone.id}`).set(as(u.admin));
      expect(res.status).toBe(200);
      expect(await prisma.user.findUnique({ where: { id: u.gone.id } })).toBeNull();
      const log = await prisma.activityLog.findFirst({ where: { entityType: "User", entityId: u.gone.id, action: "DELETE" } });
      expect(log).not.toBeNull();
    });
  });
});
