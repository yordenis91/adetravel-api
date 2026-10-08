// Ciclo de vida de un nomenclador con hijos (país → ciudades/regiones): desactivar pide confirmar
// si hay dependientes, el alta no choca en silencio con un registro desactivado y la reactivación
// respeta al padre. Requiere Postgres migrado (npm run test:e2e).
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

const tag = `cat-${Date.now()}`;

describe("Nomencladores: baja, duplicados y reactivación (integración con Postgres)", () => {
  let admin: any;
  let auth: string;
  const api = (m: "get" | "post" | "patch" | "delete", path: string) => request(app)[m](`/api${path}`).set("Authorization", auth);

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { email: `${tag}@example.com`, fullName: "A", passwordHash: "x", role: "ADMINISTRADOR" } });
    auth = `Bearer ${jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, env.JWT_SECRET)}`;
  });

  afterAll(async () => {
    const countries = await prisma.country.findMany({ where: { name: { startsWith: tag } } });
    const ids = countries.map((c: any) => c.id);
    await prisma.city.deleteMany({ where: { countryId: { in: ids } } });
    await prisma.region.deleteMany({ where: { countryId: { in: ids } } });
    await prisma.country.deleteMany({ where: { id: { in: ids } } });
    await prisma.carModel.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.carBrand.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.activityLog.deleteMany({ where: { performedBy: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  it("país con ciudades y regiones: dependents, 409 sin cascade y baja en cascada con cascade", async () => {
    const country = (await api("post", "/countries").send({ name: `${tag} Pais` })).body.data;
    await api("post", "/cities").send({ name: `${tag} C1`, countryId: country.id });
    await api("post", "/cities").send({ name: `${tag} C2`, countryId: country.id });
    await api("post", "/regions").send({ name: `${tag} R1`, countryId: country.id });

    const deps = await api("get", `/countries/${country.id}/dependents`);
    expect(deps.body.data).toEqual({ total: 3, items: [{ label: "ciudades", singular: "ciudad", count: 2 }, { label: "regiones", singular: "región", count: 1 }] });

    const refused = await api("delete", `/countries/${country.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("CATALOG_HAS_DEPENDENTS");
    expect(refused.body.error).toMatch(/2 ciudades y 1 región/);
    expect((await prisma.country.findUnique({ where: { id: country.id } })).isActive).toBe(true);

    expect((await api("delete", `/countries/${country.id}?cascade=true`)).status).toBe(200);
    expect(await prisma.city.count({ where: { countryId: country.id, isActive: true } })).toBe(0);
    expect(await prisma.region.count({ where: { countryId: country.id, isActive: true } })).toBe(0);
  });

  it("volver a crear un país desactivado explica que existe inactivo; uno activo, que ya existe", async () => {
    const inactive = await api("post", "/countries").send({ name: `${tag} Pais`.toUpperCase() });
    expect(inactive.status).toBe(409);
    expect(inactive.body.code).toBe("CATALOG_DUPLICATE_INACTIVE");

    const active = (await api("post", "/countries").send({ name: `${tag} Otro` })).body.data;
    const dup = await api("post", "/countries").send({ name: `${tag} otro` });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("CATALOG_DUPLICATE");
    expect(active.name).toBe(`${tag} Otro`);
  });

  it("una ciudad no se reactiva con el país desactivado; reactivar el país con cascade devuelve sus hijos", async () => {
    const country = await prisma.country.findFirst({ where: { name: `${tag} Pais` } });
    const city = await prisma.city.findFirst({ where: { countryId: country.id, name: `${tag} C1` } });

    const blocked = await api("patch", `/cities/${city.id}`).send({ isActive: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("CATALOG_PARENT_INACTIVE");

    expect((await api("patch", `/countries/${country.id}?cascade=true`).send({ isActive: true })).status).toBe(200);
    expect(await prisma.city.count({ where: { countryId: country.id, isActive: true } })).toBe(2);
    expect(await prisma.region.count({ where: { countryId: country.id, isActive: true } })).toBe(1);
  });

  it("el mismo nombre de ciudad se permite en otro país, no dentro del mismo", async () => {
    const a = await prisma.country.findFirst({ where: { name: `${tag} Pais` } });
    const b = (await api("post", "/countries").send({ name: `${tag} Pais B` })).body.data;
    expect((await api("post", "/cities").send({ name: `${tag} C1`, countryId: b.id })).status).toBe(201);
    expect((await api("post", "/cities").send({ name: `${tag} c1`, countryId: a.id })).status).toBe(409);
  });

  it("marca con modelos activos pide confirmación para desactivarse", async () => {
    const brand = (await api("post", "/car-brands").send({ name: `${tag} Marca` })).body.data;
    await api("post", "/car-models").send({ name: `${tag} M1`, carBrandId: brand.id });
    const refused = await api("delete", `/car-brands/${brand.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/1 modelo/);
    expect((await api("delete", `/car-brands/${brand.id}?cascade=true`)).status).toBe(200);
  });
});
