// La bitácora oculta por defecto los eventos automáticos (sincronización programada de divisas) y los
// muestra con includeAutomatic=true. Requiere Postgres migrado (npm run test:e2e).
process.env.RATE_LIMIT_MAX = "100000";

jest.mock("../src/services/pdf.service", () => ({}));

import jwt from "jsonwebtoken";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require("../src/config/env");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../src/lib/prisma");

const tag = `bitac-${process.pid}-${Date.now()}`;

describe("eventos automáticos en la bitácora (integración con Postgres)", () => {
  let admin: any;
  const ids: string[] = [];

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { email: `${tag}@example.com`, fullName: "Admin", passwordHash: "x", role: "ADMINISTRADOR" } });
    const mk = async (data: Record<string, unknown>) => ids.push((await prisma.activityLog.create({ data: data as any })).id);
    await mk({ action: "SYNC_API", entityType: "SystemConfig", entityId: "cfg", entityLabel: `${tag} automática`, performedBy: null });
    await mk({ action: "SYNC_API", entityType: "SystemConfig", entityId: "cfg", entityLabel: `${tag} manual`, performedBy: admin.id });
    await mk({ action: "CREATE", entityType: "Client", entityId: "c1", entityLabel: `${tag} cliente`, performedBy: admin.id });
    await mk({ action: "UPDATE", entityType: "Client", entityId: "c1", entityLabel: `${tag} sin autor`, performedBy: null });
  });

  afterAll(async () => {
    await prisma.activityLog.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: admin?.id } });
    await prisma.$disconnect();
  });

  const get = (path: string) =>
    request(app).get(path).set("Authorization", `Bearer ${jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, env.JWT_SECRET)}`);
  const labels = async (query = "") =>
    ((await get(`/api/activity-logs?limit=100&search=${tag}${query}`)).body.data as Array<{ entityLabel: string }>).map((l) => l.entityLabel.replace(`${tag} `, "")).sort();

  it("por defecto oculta solo la sincronización automática", async () => {
    expect(await labels()).toEqual(["cliente", "manual", "sin autor"]);
  });

  it("includeAutomatic=true la muestra", async () => {
    expect(await labels("&includeAutomatic=true")).toEqual(["automática", "cliente", "manual", "sin autor"]);
  });

  it("includeAutomatic=false equivale al valor por defecto", async () => {
    expect(await labels("&includeAutomatic=false")).toEqual(["cliente", "manual", "sin autor"]);
  });

  it("un valor no válido se rechaza", async () => {
    expect((await get(`/api/activity-logs?includeAutomatic=quizas`)).status).toBe(400);
  });

  it("las estadísticas también excluyen lo automático salvo que se pida", async () => {
    const hidden = (await get("/api/activity-logs/stats?days=7")).body.data;
    const all = (await get("/api/activity-logs/stats?days=7&includeAutomatic=true")).body.data;
    expect(all.total).toBeGreaterThan(hidden.total);
    expect(all.recent).toBeGreaterThan(hidden.recent);
    expect(all.today).toBeGreaterThan(hidden.today);
  });
});
