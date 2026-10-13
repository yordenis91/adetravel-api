// La búsqueda global y el listado de clientes ignoran tildes y mayúsculas. Requiere Postgres migrado (npm run test:e2e).
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

// Marca única sin tildes ni mayúsculas, para que los resultados no se mezclen con otras suites.
const tag = `zq${process.pid}${Date.now()}`;

describe("búsqueda sin tildes (integración con Postgres)", () => {
  let admin: any;
  const rec: Record<string, any> = {};

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { email: `${tag}-a@example.com`, fullName: "A", passwordHash: "x", role: "ADMINISTRADOR" } });
    rec.tomas = await prisma.client.create({ data: { firstName: `Tomás${tag}`, lastName: "Castro", email: `${tag}1@cliente.cl` } });
    rec.nino = await prisma.client.create({ data: { firstName: `Niño${tag}`, lastName: "ÁLVAREZ", email: `${tag}2@cliente.cl` } });
    rec.plain = await prisma.client.create({ data: { firstName: `Pedro${tag}`, lastName: "Soto", email: `${tag}3@cliente.cl`, phone: "+56 9 1234 5678" } });
    rec.request = await prisma.request.create({
      data: { requestNumber: `REQ-${tag}`, clientId: rec.plain.id, destinationCity: `Perú${tag}`, originCity: "Santiago" },
    });
    rec.voucher = await prisma.voucher.create({
      data: { voucherNumber: `VCH-${tag}`, requestId: rec.request.id, clientId: rec.plain.id, serviceName: `Excursión${tag}`, destination: "Cusco" },
    });
  });

  afterAll(async () => {
    await prisma.voucher.deleteMany({ where: { id: rec.voucher?.id } });
    await prisma.request.deleteMany({ where: { id: rec.request?.id } });
    await prisma.client.deleteMany({ where: { id: { in: [rec.tomas?.id, rec.nino?.id, rec.plain?.id].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: admin?.id } });
    await prisma.$disconnect();
  });

  const get = (path: string) =>
    request(app).get(path).set("Authorization", `Bearer ${jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, env.JWT_SECRET)}`);
  const globalSearch = async (q: string) => {
    const { body } = await get(`/api/search?q=${encodeURIComponent(q)}`);
    return body.data ?? body;
  };
  const names = (rows: any[]) => rows.map((r) => r.firstName);

  describe("búsqueda global", () => {
    it.each([
      [`tomas${tag}`, "sin tilde encuentra al que tiene tilde"],
      [`Tomás${tag}`, "con tilde también"],
      [`TOMAS${tag}`, "mayúsculas"],
      [`nino${tag}`, "ñ equivale a n"],
      ["alvarez", "apellido en mayúsculas con tilde"],
    ])("clientes: %s (%s)", async (q) => {
      const body = await globalSearch(q);
      expect(names(body.clients).join(" ")).toMatch(/Tomás|Niño/);
    });

    it("el término sin tilde no mezcla clientes que no coinciden", async () => {
      const body = await globalSearch(`tomas${tag}`);
      expect(names(body.clients)).toEqual([`Tomás${tag}`]);
    });

    it("solicitudes por ciudad con tilde, escribiendo sin ella", async () => {
      const body = await globalSearch(`peru${tag}`);
      expect(body.requests.map((r: any) => r.requestNumber)).toContain(`REQ-${tag}`);
    });

    it("vouchers por nombre de servicio con tilde, escribiendo sin ella", async () => {
      const body = await globalSearch(`excursion${tag}`);
      expect(body.vouchers.map((v: any) => v.voucherNumber)).toContain(`VCH-${tag}`);
    });

    it("la búsqueda global no incluye el teléfono (comportamiento previo)", async () => {
      const body = await globalSearch("1234 5678");
      expect(names(body.clients)).not.toContain(`Pedro${tag}`);
    });

    it("% y _ se buscan como texto, no como comodines", async () => {
      expect(names((await globalSearch("%%")).clients)).not.toContain(`Pedro${tag}`);
      expect(names((await globalSearch("p_dro")).clients)).not.toContain(`Pedro${tag}`);
    });

    it("un término demasiado corto sigue devolviendo vacío", async () => {
      const body = await globalSearch("t");
      expect(body.clients).toEqual([]);
    });
  });

  describe("listado de clientes (?search=)", () => {
    const list = async (q: string) => {
      const res = await get(`/api/clients?limit=100&search=${encodeURIComponent(q)}`);
      return (res.body.data ?? res.body).map((c: any) => c.firstName);
    };

    it("ignora tildes y mayúsculas", async () => {
      expect(await list(`tomas${tag}`)).toEqual([`Tomás${tag}`]);
      expect(await list(`NIÑO${tag}`)).toEqual([`Niño${tag}`]);
    });

    it("sigue buscando por teléfono y por correo", async () => {
      expect(await list("1234 5678")).toContain(`Pedro${tag}`);
      expect(await list(`${tag}3@cliente`)).toEqual([`Pedro${tag}`]);
    });

    it("sin resultados devuelve una lista vacía, no todos los clientes", async () => {
      expect(await list(`inexistente${tag}`)).toEqual([]);
    });
  });
});
