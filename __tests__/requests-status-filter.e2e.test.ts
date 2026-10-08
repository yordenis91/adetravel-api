// GET /requests?status=A,B: filtro por uno o varios estados (pestañas por fase del cliente).
// Requiere Postgres migrado (npm run test:e2e).
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

const tag = `rsf-${Date.now()}`;

describe("GET /requests filtrado por estado (integración con Postgres)", () => {
  let admin: any;
  let client: any;

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { email: `${tag}@example.com`, fullName: "A", passwordHash: "x", role: "ADMINISTRADOR" } });
    client = await prisma.client.create({ data: { firstName: "Filtro", lastName: "Estado" } });
    const statuses = ["RECEPCIONADA", "ENVIADO_AL_CLIENTE", "ACEPTADA_POR_CLIENTE", "VENDIDA"];
    for (const [i, status] of statuses.entries()) {
      await prisma.request.create({ data: { requestNumber: `${tag}-${i}`, clientId: client.id, status } });
    }
  });

  afterAll(async () => {
    await prisma.request.deleteMany({ where: { requestNumber: { startsWith: tag } } });
    await prisma.client.deleteMany({ where: { id: client?.id } });
    await prisma.user.deleteMany({ where: { id: admin?.id } });
    await prisma.$disconnect();
  });

  const get = (qs: string) =>
    request(app).get(`/api/requests?limit=100&search=${tag}&${qs}`).set("Authorization", `Bearer ${jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, env.JWT_SECRET)}`);
  const statusesOf = (res: any) => res.body.data.map((r: any) => r.status).sort();

  it("un estado", async () => {
    const res = await get("status=VENDIDA");
    expect(res.status).toBe(200);
    expect(statusesOf(res)).toEqual(["VENDIDA"]);
  });

  it("varios estados separados por comas (mayúsculas o minúsculas)", async () => {
    const res = await get("status=enviado_al_cliente,ACEPTADA_POR_CLIENTE");
    expect(res.status).toBe(200);
    expect(statusesOf(res)).toEqual(["ACEPTADA_POR_CLIENTE", "ENVIADO_AL_CLIENTE"]);
    expect(res.body.total).toBe(2);
  });

  it("rechaza un estado inválido, aunque vaya junto a uno válido", async () => {
    expect((await get("status=VENDIDA,INVENTADO")).status).toBe(400);
  });

  it("sin estado devuelve todos", async () => {
    expect(statusesOf(await get(""))).toHaveLength(4);
  });
});
