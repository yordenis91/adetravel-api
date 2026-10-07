// Qué ve cada rol y cada usuario: permisos por endpoint y datos del cliente incrustado.
// Requiere Postgres migrado (npm run test:e2e). Las expectativas están escritas a mano a partir de
// la matriz de roles (no se calculan con el mismo código que se prueba).
// Esta suite hace cientos de peticiones desde una sola IP: se sube el límite global para no medir el 429.
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

const tag = `vis-${Date.now()}`;
const token = (u: { id: string; email: string; role: string }) => jwt.sign({ id: u.id, email: u.email, role: u.role }, env.JWT_SECRET);

// endpoint (GET) → clave corta usada en las listas de abajo
const ENDPOINTS: Record<string, string> = {
  users: "/api/users",
  clients: "/api/clients",
  providers: "/api/providers",
  requests: "/api/requests",
  services: "/api/services",
  quotations: "/api/quotations",
  confirmations: "/api/confirmations",
  payments: "/api/payments",
  vouchers: "/api/vouchers",
  logs: "/api/activity-logs",
  config: "/api/system-config",
  templates: "/api/email-templates",
  reports: "/api/reports",
  catalogs: "/api/countries",
  permissions: "/api/permissions/roles",
};
const ALL = Object.keys(ENDPOINTS);

// Lo que cada rol PUEDE leer (todo lo demás debe dar 403).
const CAN: Record<string, string[]> = {
  GERENTE: ALL,
  FINANZAS: ["users", "clients", "providers", "requests", "services", "quotations", "confirmations", "payments", "reports", "catalogs"],
  OPERACIONES: ["users", "clients", "providers", "requests", "services", "quotations", "confirmations", "payments", "vouchers", "catalogs"],
  AGENTE_VENTAS: ["users", "clients", "requests", "services", "quotations", "confirmations", "payments", "vouchers", "catalogs"],
};

const SENSITIVE = ["passportNumber", "bankAccount", "bankAccountHolder"];

describe("visibilidad por rol y por usuario (integración con Postgres)", () => {
  const users: Record<string, any> = {};
  let client: any;
  let req: any;
  let payment: any;

  const make = (key: string, data: any) =>
    prisma.user.create({ data: { email: `${tag}-${key}@example.com`, fullName: key, passwordHash: "x", ...data } });

  beforeAll(async () => {
    users.ADMIN = await make("admin", { role: "ADMINISTRADOR" });
    for (const r of Object.keys(CAN)) users[r] = await make(r, { role: "USUARIO", agencyRole: r });
    users.SIN_ROL = await make("sinrol", { role: "USUARIO" });
    // Réplica de la cuenta de seguimiento: OPERACIONES con todo denegado salvo VIEW_REQUESTS, más VIEW_LOGS directo.
    users.SEGUIMIENTO = await make("seg", { role: "USUARIO", agencyRole: "OPERACIONES" });
    const opsExtra = [
      "VIEW_USERS", "VIEW_CLIENTS", "VIEW_SERVICES", "MANAGE_SERVICES", "VIEW_QUOTATIONS", "VIEW_CONFIRMATIONS",
      "MANAGE_CONFIRMATIONS", "VIEW_PAYMENTS", "VIEW_PROVIDERS", "MANAGE_PROVIDERS", "VIEW_VOUCHERS",
      "MANAGE_VOUCHERS", "VIEW_CATALOGS", "SEND_BIRTHDAY_EMAILS",
    ];
    await prisma.userPermission.createMany({
      data: opsExtra.map((permission) => ({ userId: users.SEGUIMIENTO.id, permission, effect: "DENY" as const, grantedBy: users.ADMIN.id })),
    });

    // VIEW_LOGS no está en OPERACIONES: la cuenta real lo tiene como permiso directo (GRANT).
    await prisma.userPermission.create({
      data: { userId: users.SEGUIMIENTO.id, permission: "VIEW_LOGS", effect: "GRANT", grantedBy: users.ADMIN.id },
    });

    client = await prisma.client.create({
      data: { firstName: "Vis", lastName: "Test", passportNumber: "P1234567", bankAccount: "000111222", bankAccountHolder: "Titular Vis" },
    });
    req = await prisma.request.create({ data: { requestNumber: `REQ-${tag}`, clientId: client.id } });
    payment = await prisma.payment.create({
      data: { paymentNumber: `PAG-${tag}`, requestId: req.id, clientId: client.id, amount: 1, currency: "CLP", method: "EFECTIVO", status: "PENDIENTE" },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { id: payment?.id } });
    await prisma.request.deleteMany({ where: { id: req?.id } });
    await prisma.client.deleteMany({ where: { id: client?.id } });
    const ids = Object.values(users).map((u: any) => u.id);
    await prisma.userPermission.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  const get = (who: string, path: string) => request(app).get(path).set("Authorization", `Bearer ${token(users[who])}`);
  const status = async (who: string, key: string) => (await get(who, ENDPOINTS[key])).status;

  describe.each(Object.keys(CAN))("rol %s", (role) => {
    it("lee exactamente lo que su matriz permite y recibe 403 en el resto", async () => {
      const got: Record<string, number> = {};
      for (const key of ALL) got[key] = await status(role, key);
      const expected = Object.fromEntries(ALL.map((k) => [k, CAN[role].includes(k) ? "allowed" : 403]));
      const actual = Object.fromEntries(ALL.map((k) => [k, got[k] === 403 ? 403 : got[k] < 400 ? "allowed" : got[k]]));
      expect(actual).toEqual(expected);
    });
  });

  it("ADMINISTRADOR lee todo", async () => {
    for (const key of ALL) expect([key, (await status("ADMIN", key)) < 400]).toEqual([key, true]);
  });

  it("un usuario sin rol de agencia recibe 403 en todo", async () => {
    for (const key of ALL) expect([key, await status("SIN_ROL", key)]).toEqual([key, 403]);
  });

  it("la cuenta de seguimiento (OPERACIONES con denegaciones) solo lee solicitudes y bitácora", async () => {
    for (const key of ALL) {
      const s = await status("SEGUIMIENTO", key);
      expect([key, key === "requests" || key === "logs" ? s < 400 : s]).toEqual([key, key === "requests" || key === "logs" ? true : 403]);
    }
  });

  it("la cuenta de seguimiento no puede escribir en ningún módulo", async () => {
    const writes: Array<[string, string]> = [
      ["post", "/api/requests"], ["post", "/api/clients"], ["post", "/api/services"], ["post", "/api/payments"],
      ["post", "/api/quotations"], ["post", "/api/vouchers"], ["post", "/api/providers"],
      ["patch", `/api/requests/${"00000000-0000-4000-8000-000000000000"}/status`],
      ["delete", `/api/requests/${"00000000-0000-4000-8000-000000000000"}`],
    ];
    for (const [m, path] of writes) {
      const res = await (request(app) as any)[m](path).set("Authorization", `Bearer ${token(users.SEGUIMIENTO)}`).send({});
      expect([m, path, res.status]).toEqual([m, path, 403]);
    }
  });

  describe("datos del cliente incrustado en otras respuestas", () => {
    const embedded = (res: any) => (res.body.data ?? []).find((r: any) => r.id === req.id)?.client;

    it("quien tiene VIEW_CLIENTS (OPERACIONES) ve el cliente completo en /requests", async () => {
      const c = embedded(await get("OPERACIONES", "/api/requests?limit=100"));
      expect(c).toBeDefined();
      for (const f of SENSITIVE) expect(c).toHaveProperty(f);
    });

    it("la cuenta de seguimiento (sin VIEW_CLIENTS) solo recibe id, nombre y apellido", async () => {
      const c = embedded(await get("SEGUIMIENTO", "/api/requests?limit=100"));
      expect(c).toBeDefined();
      expect(Object.keys(c).sort()).toEqual(["firstName", "id", "lastName"]);
      for (const f of SENSITIVE) expect(c).not.toHaveProperty(f);
    });

    it("sin VIEW_CLIENTS tampoco aparece en el detalle de la solicitud", async () => {
      const res = await get("SEGUIMIENTO", `/api/requests/${req.id}`);
      expect(res.status).toBe(200);
      const c = (res.body.data ?? res.body).client;
      if (c) for (const f of SENSITIVE) expect(c).not.toHaveProperty(f);
    });
  });

  describe("buscador global", () => {
    const search = async (who: string) => (await get(who, `/api/search?q=${encodeURIComponent("Vis")}`)).body;

    it("la cuenta de seguimiento no obtiene clientes ni pagos por el buscador", async () => {
      const body = JSON.stringify(await search("SEGUIMIENTO"));
      expect(body).not.toContain("P1234567");
      expect(body).not.toContain("Titular Vis");
      expect(body).not.toContain(`PAG-${tag}`);
    });

    it("OPERACIONES sí encuentra el cliente", async () => {
      expect(JSON.stringify(await search("OPERACIONES"))).toContain("Vis");
    });
  });
});
