// @react-pdf/renderer es ESM puro y Jest no lo transforma; el PDF no interviene en este flujo.
jest.mock("../src/services/pdf.service", () => ({}));

import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";

const tag = `deny-${Date.now()}`;
const tokenFor = (u: { id: string; email: string; role: string }) =>
  jwt.sign({ id: u.id, email: u.email, role: u.role }, env.JWT_SECRET);

// POST /services con cuerpo vacío: si el usuario tiene MANAGE_SERVICES la petición llega a la
// validación (400) sin crear nada; si no lo tiene, el middleware de permisos corta antes (403).
const tryManageServices = (token: string) =>
  request(app).post("/api/services").set("Authorization", `Bearer ${token}`).send({});

describe("denegar un permiso a un usuario (integración con Postgres)", () => {
  let admin: any;
  let ops: any;
  let adminToken: string;
  let opsToken: string;

  beforeAll(async () => {
    admin = await prisma.user.create({
      data: { email: `${tag}-admin@example.com`, fullName: "Admin Prueba", passwordHash: "x", role: "ADMINISTRADOR" },
    });
    ops = await prisma.user.create({
      data: { email: `${tag}-ops@example.com`, fullName: "Operaciones Prueba", passwordHash: "x", role: "USUARIO", agencyRole: "OPERACIONES" },
    });
    adminToken = tokenFor(admin);
    opsToken = tokenFor(ops);
  });

  afterAll(async () => {
    await prisma.permissionAudit.deleteMany({ where: { targetUserId: ops.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, ops.id] } } });
    await prisma.$disconnect();
  });

  it("antes de denegar, OPERACIONES alcanza MANAGE_SERVICES", async () => {
    expect((await tryManageServices(opsToken)).status).toBe(400);
  });

  it("deniega, el permiso se pierde de inmediato y el resto se conserva", async () => {
    const deny = await request(app)
      .post(`/api/permissions/users/${ops.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ permission: "MANAGE_SERVICES", effect: "DENY" });
    expect(deny.status).toBe(201);

    expect((await tryManageServices(opsToken)).status).toBe(403);
    const view = await request(app).get("/api/services").set("Authorization", `Bearer ${opsToken}`);
    expect(view.status).toBe(200);

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${opsToken}`);
    expect(me.body.data.permissions).not.toContain("MANAGE_SERVICES");
    expect(me.body.data.permissions).toContain("VIEW_SERVICES");

    const detail = await request(app).get(`/api/permissions/users/${ops.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(detail.body.data.deniedPermissions.map((d: any) => d.permission)).toEqual(["MANAGE_SERVICES"]);
    expect(detail.body.data.rolePermissions).toContain("MANAGE_SERVICES");
    expect(detail.body.data.effectivePermissions).not.toContain("MANAGE_SERVICES");
  });

  it("el rol de los demás no cambia: otro usuario OPERACIONES sigue con el permiso", async () => {
    const other = await prisma.user.create({
      data: { email: `${tag}-other@example.com`, fullName: "Otro Operaciones", passwordHash: "x", role: "USUARIO", agencyRole: "OPERACIONES" },
    });
    try {
      expect((await tryManageServices(tokenFor(other))).status).toBe(400);
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });

  it("quitar la denegación restaura el permiso", async () => {
    const res = await request(app)
      .delete(`/api/permissions/users/${ops.id}/MANAGE_SERVICES`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect((await tryManageServices(opsToken)).status).toBe(400);
  });

  it("la bitácora de permisos registra la denegación y su restauración", async () => {
    const actions = (await prisma.permissionAudit.findMany({ where: { targetUserId: ops.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["USER_PERMISSION_DENIED", "USER_PERMISSION_DENY_REMOVED"]);
  });

  it("no se puede denegar a un administrador", async () => {
    const res = await request(app)
      .post(`/api/permissions/users/${admin.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ permission: "MANAGE_USERS", effect: "DENY" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ADMIN_NOT_RESTRICTABLE");
  });

  it("un usuario sin MANAGE_PERMISSIONS no puede denegar a nadie", async () => {
    const res = await request(app)
      .post(`/api/permissions/users/${admin.id}`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ permission: "VIEW_LOGS", effect: "DENY" });
    expect(res.status).toBe(403);
  });
});
