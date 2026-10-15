// Tareas contra Postgres real: propias, delegadas, reasignación, notificaciones y bitácora.
// Requiere Postgres migrado (npm run test:e2e).
process.env.RATE_LIMIT_MAX = "100000";

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

const tag = `tk${process.pid}${Date.now()}`;

type TestUser = { id: string; email: string; fullName: string; role: string; tokenVersion?: number };
type Row = { id: string; status?: string; assigneeName?: string | null; createdByName?: string | null };

describe("tareas (integración con Postgres)", () => {
  const u: Record<string, TestUser> = {};
  const taskIds: string[] = [];

  const mk = async (key: string, data: Record<string, unknown> = {}) => {
    u[key] = await prisma.user.create({
      data: { email: `${tag}-${key}@example.com`, fullName: `Tareas ${key}`, passwordHash: await bcrypt.hash("Inicial-2026!", 4), role: "USUARIO", ...data },
    });
  };
  const as = (user: TestUser) => ({
    Authorization: `Bearer ${jwt.sign({ id: user.id, email: user.email, role: user.role, tv: 0 }, env.JWT_SECRET)}`,
  });
  const body = (extra: Record<string, unknown> = {}) => ({
    title: `Tarea ${tag}`,
    dueDate: "2026-12-31",
    priority: "MEDIA",
    ...extra,
  });
  const create = async (user: TestUser, extra: Record<string, unknown> = {}) => {
    const res = await request(app).post("/api/tasks").set(as(user)).send(body(extra));
    if (res.body?.data?.id) taskIds.push(res.body.data.id);
    return res;
  };

  beforeAll(async () => {
    await mk("ana");
    await mk("beto");
    await mk("carla");
    await mk("inactivo", { isActive: false });
  });

  afterAll(async () => {
    const userIds = Object.values(u).map((x: TestUser) => x.id);
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.activityLog.deleteMany({ where: { entityId: { in: taskIds } } });
    await prisma.task.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: `${tag}-` } } });
    await prisma.$disconnect();
  });

  it("sin sesión: 401", async () => {
    expect((await request(app).get("/api/tasks")).status).toBe(401);
  });

  it("una tarea propia queda asignada al que la crea y genera una notificación", async () => {
    const res = await create(u.ana);
    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(u.ana.id);
    expect(res.body.data.createdBy).toBe(u.ana.id);
    const notes = await prisma.notification.findMany({ where: { userId: u.ana.id, relatedEntityId: res.body.data.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain("Se ha registrado la tarea");
  });

  it("rechaza una tarea sin título", async () => {
    const res = await request(app).post("/api/tasks").set(as(u.ana)).send({ dueDate: "2026-12-31", priority: "MEDIA" });
    expect(res.status).toBe(400);
  });

  it("una tarea de prioridad ALTA queda en la bitácora", async () => {
    const res = await create(u.ana, { priority: "ALTA" });
    const log = await prisma.activityLog.findFirst({ where: { entityType: "Task", entityId: res.body.data.id } });
    expect(log?.description).toContain("prioridad ALTA");
  });

  describe("delegación", () => {
    let delegated: Row;

    it("asigna a otro usuario, le notifica y queda en la bitácora", async () => {
      const res = await create(u.ana, { assigneeId: u.beto.id });
      expect(res.status).toBe(201);
      delegated = res.body.data;
      expect(delegated.userId).toBe(u.beto.id);
      expect(delegated.createdBy).toBe(u.ana.id);
      const note = await prisma.notification.findFirst({ where: { userId: u.beto.id, relatedEntityId: delegated.id } });
      expect(note?.message).toContain(u.ana.fullName);
      const log = await prisma.activityLog.findFirst({ where: { entityId: delegated.id } });
      expect(log?.description).toBe("Tarea asignada a otro usuario");
    });

    it("no se puede asignar a un usuario inexistente ni inactivo", async () => {
      const missing = await create(u.ana, { assigneeId: "00000000-0000-4000-8000-000000000000" });
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe("ASSIGNEE_NOT_FOUND");
      const inactive = await create(u.ana, { assigneeId: u.inactivo.id });
      expect(inactive.status).toBe(409);
      expect(inactive.body.code).toBe("ASSIGNEE_INACTIVE");
    });

    it("el asignado la ve en «mis tareas» y quien la creó, en «delegadas»", async () => {
      const mine = await request(app).get("/api/tasks").set(as(u.beto));
      expect(mine.body.data.map((t: Row) => t.id)).toContain(delegated.id);
      const del = await request(app).get("/api/tasks?scope=delegated").set(as(u.ana));
      const found = del.body.data.find((t: Row) => t.id === delegated.id);
      expect(found).toBeDefined();
      expect(found.assigneeName).toBe(u.beto.fullName);
      expect(found.createdByName).toBe(u.ana.fullName);
      // Y no aparece entre las propias de quien la delegó.
      const anaMine = await request(app).get("/api/tasks").set(as(u.ana));
      expect(anaMine.body.data.map((t: Row) => t.id)).not.toContain(delegated.id);
    });

    it("un tercero no la ve, no la edita y no la borra", async () => {
      const list = await request(app).get("/api/tasks").set(as(u.carla));
      expect(list.body.data.map((t: Row) => t.id)).not.toContain(delegated.id);
      expect((await request(app).patch(`/api/tasks/${delegated.id}`).set(as(u.carla)).send({ status: "COMPLETADA" })).status).toBe(404);
      expect((await request(app).delete(`/api/tasks/${delegated.id}`).set(as(u.carla))).status).toBe(404);
    });

    it("quien la creó puede reasignarla y el nuevo responsable recibe la notificación", async () => {
      const res = await request(app).patch(`/api/tasks/${delegated.id}`).set(as(u.ana)).send({ assigneeId: u.carla.id });
      expect(res.status).toBe(200);
      expect(res.body.data.userId).toBe(u.carla.id);
      const note = await prisma.notification.findFirst({ where: { userId: u.carla.id, relatedEntityId: delegated.id } });
      expect(note).not.toBeNull();
      const log = await prisma.activityLog.findFirst({ where: { entityId: delegated.id, description: "Tarea reasignada a otro usuario" } });
      expect(log).not.toBeNull();
    });
  });

  describe("estado y filtros", () => {
    it("completar una tarea notifica y deja una sola entrada en la bitácora; repetirlo no duplica", async () => {
      const created = await create(u.beto);
      const id = created.body.data.id;
      expect((await request(app).patch(`/api/tasks/${id}`).set(as(u.beto)).send({ status: "COMPLETADA" })).status).toBe(200);
      expect((await request(app).patch(`/api/tasks/${id}`).set(as(u.beto)).send({ status: "COMPLETADA" })).status).toBe(200);
      const logs = await prisma.activityLog.findMany({ where: { entityId: id, description: "Tarea marcada como COMPLETADA" } });
      expect(logs).toHaveLength(1);
      const notes = await prisma.notification.findMany({ where: { userId: u.beto.id, relatedEntityId: id, type: "SUCCESS" } });
      expect(notes).toHaveLength(1);
    });

    it("filtra por estado y por entidad relacionada", async () => {
      const related = await create(u.carla, { relatedEntityType: "REQUEST", relatedEntityId: `rel-${tag}` });
      const done = await request(app).get("/api/tasks?status=COMPLETADA").set(as(u.beto));
      expect(done.body.data.every((t: Row) => t.status === "COMPLETADA")).toBe(true);
      const byEntity = await request(app).get(`/api/tasks?relatedEntityId=rel-${tag}&relatedEntityType=REQUEST`).set(as(u.carla));
      expect(byEntity.body.data.map((t: Row) => t.id)).toEqual([related.body.data.id]);
    });

    it("pagina el listado", async () => {
      const res = await request(app).get("/api/tasks?limit=1&page=1").set(as(u.ana));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBeGreaterThan(1);
    });
  });

  describe("borrado", () => {
    it("el dueño elimina su tarea; una inexistente da 404", async () => {
      const created = await create(u.carla);
      expect((await request(app).delete(`/api/tasks/${created.body.data.id}`).set(as(u.carla))).status).toBe(200);
      expect(await prisma.task.findUnique({ where: { id: created.body.data.id } })).toBeNull();
      expect((await request(app).delete("/api/tasks/00000000-0000-4000-8000-000000000000").set(as(u.carla))).status).toBe(404);
    });
  });
});
