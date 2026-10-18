// Importación de clientes contra Postgres real: vista previa sin guardar, guardado, duplicados
// (contra la base y dentro del archivo, con RUT en distintos formatos), filas inválidas, permisos y topes.
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

const tag = `ci${process.pid}${Date.now()}`;

describe("importar clientes (integración con Postgres)", () => {
  let admin: { id: string; email: string; role: string };
  let viewer: { id: string; email: string; role: string };
  const tokenOf = (u: { id: string; email: string; role: string }) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email, role: u.role, tv: 0 }, env.JWT_SECRET)}` });
  const auth = () => tokenOf(admin);
  const post = (rows: unknown[], dryRun?: boolean) => request(app).post("/api/clients/import").set(auth()).send({ rows, dryRun });
  const mine = () => prisma.client.findMany({ where: { lastName: { contains: tag } } });

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { email: `${tag}-admin@example.com`, fullName: "Admin import", passwordHash: await bcrypt.hash("Inicial-2026!", 4), role: "ADMINISTRADOR" } });
    viewer = await prisma.user.create({ data: { email: `${tag}-finanzas@example.com`, fullName: "Finanzas import", passwordHash: await bcrypt.hash("Inicial-2026!", 4), role: "USUARIO", agencyRole: "FINANZAS" } });
  });

  afterAll(async () => {
    const ids = (await mine()).map((c: { id: string }) => c.id);
    await prisma.activityLog.deleteMany({ where: { OR: [{ entityId: { in: ids } }, { performedBy: admin.id }] } });
    await prisma.client.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, viewer.id] } } });
    await prisma.$disconnect();
  });

  it("la vista previa (dryRun) valida y no guarda nada", async () => {
    const res = await post([{ firstName: "Ana", lastName: `Uno ${tag}`, email: `${tag}-1@example.com` }], true);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ dryRun: true, total: 1, valid: 1, duplicates: 0, invalid: 0 });
    expect(await mine()).toHaveLength(0);
  });

  it("guarda las filas válidas con createdBy, correos adicionales y deja una entrada en la bitácora", async () => {
    const res = await post([
      { firstName: "Ana", lastName: `Uno ${tag}`, email: `${tag}-1@example.com`, rut: "11.111.111-1", additionalEmails: [`${tag}-a@example.com`], referralSource: "WEBSITE" },
      { firstName: "Beto", lastName: `Dos ${tag}`, phone: "+56 9 1234 5678" },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ dryRun: false, total: 2, valid: 2, duplicates: 0, invalid: 0 });
    const saved = await mine();
    expect(saved).toHaveLength(2);
    const ana = saved.find((c: { firstName: string }) => c.firstName === "Ana");
    expect(ana).toMatchObject({ createdBy: admin.id, isActive: true, additionalEmails: [`${tag}-a@example.com`], referralSource: "WEBSITE" });
    const log = await prisma.activityLog.findFirst({ where: { performedBy: admin.id, entityLabel: "Importación de 2 clientes" } });
    expect(log).not.toBeNull();
  });

  it("omite duplicados: mismo RUT con otro formato, mismo correo con otras mayúsculas, y no pisa el existente", async () => {
    const res = await post([
      { firstName: "Otra", lastName: `Persona ${tag}`, rut: "111111111" },
      { firstName: "Otro", lastName: `Correo ${tag}`, email: `${tag.toUpperCase()}-1@EXAMPLE.COM` },
      { firstName: "Nuevo", lastName: `Cliente ${tag}`, email: `${tag}-3@example.com` },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ valid: 1, duplicates: 2, invalid: 0 });
    expect(res.body.data.rows.map((r: { status: string }) => r.status)).toEqual(["duplicate", "duplicate", "valid"]);
    expect(res.body.data.rows[0].reasons[0]).toMatch(/RUT/);
    const ana = await prisma.client.findFirst({ where: { firstName: "Ana", lastName: { contains: tag } } });
    expect(ana?.rut).toBe("11.111.111-1");
    expect(await mine()).toHaveLength(3);
  });

  it("detecta duplicados dentro del propio archivo: guarda solo la primera aparición", async () => {
    const res = await post([
      { firstName: "Rep", lastName: `Uno ${tag}`, email: `${tag}-rep@example.com` },
      { firstName: "Rep", lastName: `Dos ${tag}`, email: `${tag}-REP@example.com` },
    ]);
    expect(res.body.data).toMatchObject({ valid: 1, duplicates: 1 });
    expect(res.body.data.rows[1].status).toBe("duplicate");
  });

  it("marca las filas inválidas con el motivo y guarda las demás", async () => {
    const res = await post([
      { firstName: "Sin", lastName: "" },
      { firstName: "Mal", lastName: `Correo ${tag}`, email: "no-es-correo" },
      { firstName: "Bien", lastName: `Valida ${tag}` },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ total: 3, valid: 1, invalid: 2, duplicates: 0 });
    expect(res.body.data.rows[0].reasons.join(" ")).toMatch(/lastName/);
    expect(res.body.data.rows[1].reasons.join(" ")).toMatch(/email/i);
    expect(res.body.data.rows[2].status).toBe("valid");
  });

  it("ignora campos que no son de cliente (no se puede fijar id ni createdBy)", async () => {
    const res = await post([{ firstName: "Intruso", lastName: `Campos ${tag}`, id: "00000000-0000-0000-0000-000000000000", createdBy: "otro", createdAt: "2000-01-01" }]);
    expect(res.status).toBe(201);
    const c = await prisma.client.findFirst({ where: { firstName: "Intruso", lastName: { contains: tag } } });
    expect(c.id).not.toBe("00000000-0000-0000-0000-000000000000");
    expect(c.createdBy).toBe(admin.id);
    expect(c.createdAt.getFullYear()).toBeGreaterThan(2020);
  });

  it("rechaza archivos vacíos o con más de 500 filas, y cuerpos mal formados", async () => {
    expect((await post([])).status).toBe(400);
    const many = Array.from({ length: 501 }, (_, i) => ({ firstName: "X", lastName: `Y${i}` }));
    expect((await post(many, true)).status).toBe(400);
    expect((await request(app).post("/api/clients/import").set(auth()).send({ rows: "no" })).status).toBe(400);
  });

  it("exige sesión y el permiso CREATE_CLIENT", async () => {
    expect((await request(app).post("/api/clients/import").send({ rows: [{ firstName: "A", lastName: "B" }] })).status).toBe(401);
    const res = await request(app).post("/api/clients/import").set(tokenOf(viewer)).send({ rows: [{ firstName: "A", lastName: `B ${tag}` }] });
    expect(res.status).toBe(403);
    expect(await prisma.client.count({ where: { lastName: `B ${tag}` } })).toBe(0);
  });
});
