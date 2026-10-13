// GET /api/reports incluye las tendencias del panel. Solo se comprueba la forma: los valores dependen de los
// datos de las demás suites, que corren en paralelo sobre la misma base. Requiere Postgres migrado.
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

const tag = `trd-${process.pid}-${Date.now()}`;

describe("tendencias del panel en /api/reports (integración con Postgres)", () => {
  let admin: any;

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { email: `${tag}@example.com`, fullName: "Admin", passwordHash: "x", role: "ADMINISTRADOR" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: admin?.id } });
    await prisma.$disconnect();
  });

  const get = (path: string) =>
    request(app).get(path).set("Authorization", `Bearer ${jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, env.JWT_SECRET)}`);

  it("devuelve las cuatro tendencias como pares actual/anterior de números", async () => {
    const res = await get("/api/reports");
    expect(res.status).toBe(200);
    const { trends } = res.body.data;
    expect(trends.windowDays).toBe(30);
    for (const key of ["clients", "requests", "confirmedTrips", "revenue"]) {
      expect(typeof trends[key].current).toBe("number");
      expect(typeof trends[key].previous).toBe("number");
      expect(trends[key].current).toBeGreaterThanOrEqual(0);
    }
  });

  it("no cambia con el filtro de fechas del reporte y no rompe el resto de la respuesta", async () => {
    const res = await get("/api/reports?dateFrom=2000-01-01&dateTo=2000-01-02");
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.trends.windowDays).toBe(30);
  });
});
