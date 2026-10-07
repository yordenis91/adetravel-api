// Visibilidad del cliente incrustado en otras respuestas (clientVisibility). Requiere Postgres migrado.
// @react-pdf/renderer es ESM puro y Jest no lo transforma; el PDF no interviene en este flujo.
jest.mock("../src/services/pdf.service", () => ({}));

import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";

const tag = `cv-${Date.now()}`;
const PASSPORT = "P-SECRETO-123";
const tokenFor = (u: { id: string; email: string; role: string }) =>
  jwt.sign({ id: u.id, email: u.email, role: u.role }, env.JWT_SECRET);

describe("cliente incrustado según VIEW_CLIENTS (integración con Postgres)", () => {
  let admin: any, ops: any, seguimiento: any, client: any, req: any;
  let adminToken: string, opsToken: string, seguimientoToken: string;

  beforeAll(async () => {
    admin = await prisma.user.create({
      data: { email: `${tag}-admin@example.com`, fullName: "Admin", passwordHash: "x", role: "ADMINISTRADOR" },
    });
    ops = await prisma.user.create({
      data: { email: `${tag}-ops@example.com`, fullName: "Ops", passwordHash: "x", role: "USUARIO", agencyRole: "OPERACIONES" },
    });
    // Como el usuario de seguimiento: sin rol de agencia, solo VIEW_REQUESTS concedido.
    seguimiento = await prisma.user.create({
      data: { email: `${tag}-seg@example.com`, fullName: "Seguimiento", passwordHash: "x", role: "USUARIO" },
    });
    await prisma.userPermission.create({ data: { userId: seguimiento.id, permission: "VIEW_REQUESTS", effect: "GRANT" } });

    client = await prisma.client.create({
      data: { firstName: "Ana", lastName: "Prueba", email: `${tag}-cli@example.com`, rut: "1-9", passportNumber: PASSPORT, bankAccount: "000-111" },
    });
    req = await prisma.request.create({
      data: { requestNumber: `SOL-${tag}`, clientId: client.id, status: "RECEPCIONADA" as never },
    });
    adminToken = tokenFor(admin);
    opsToken = tokenFor(ops);
    seguimientoToken = tokenFor(seguimiento);
  });

  afterAll(async () => {
    await prisma.request.deleteMany({ where: { id: req.id } });
    await prisma.client.deleteMany({ where: { id: client.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, ops.id, seguimiento.id] } } });
    await prisma.$disconnect();
  });

  const get = (path: string, token: string) => request(app).get(path).set("Authorization", `Bearer ${token}`);

  it("sin VIEW_CLIENTS el detalle de la solicitud trae solo id y nombre del cliente", async () => {
    const res = await get(`/api/requests/${req.id}`, seguimientoToken);
    expect(res.status).toBe(200);
    expect(res.body.data.client).toEqual({ id: client.id, firstName: "Ana", lastName: "Prueba" });
    expect(JSON.stringify(res.body)).not.toMatch(new RegExp(`${PASSPORT}|000-111|${tag}-cli`));
  });

  it("sin VIEW_CLIENTS el listado también lo reduce", async () => {
    const res = await get(`/api/requests?search=${tag}`, seguimientoToken);
    expect(res.status).toBe(200);
    const item = res.body.data.find((r: any) => r.id === req.id);
    expect(item.client).toEqual({ id: client.id, firstName: "Ana", lastName: "Prueba" });
  });

  it("el administrador sigue viendo el cliente completo, con el pasaporte descifrado", async () => {
    const res = await get(`/api/requests/${req.id}`, adminToken);
    expect(res.body.data.client.passportNumber).toBe(PASSPORT);
    expect(res.body.data.client.bankAccount).toBe("000-111");
  });

  it("un rol de agencia con VIEW_CLIENTS también lo ve completo", async () => {
    const res = await get(`/api/requests/${req.id}`, opsToken);
    expect(res.body.data.client.passportNumber).toBe(PASSPORT);
  });
});
