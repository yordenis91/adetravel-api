// Permisos de ESCRITURA por rol (Ventas, Operaciones, Finanzas y Gerente), contra Postgres real.
// role-visibility.e2e.test.ts cubre las lecturas; aquí se prueba quién puede crear, editar y borrar.
// Requiere Postgres migrado (npm run test:e2e). Las expectativas están escritas a mano a partir de la
// matriz de roles de src/config/permissions.ts (no se calculan con el mismo código que se prueba).
//
// Parte 1: cada endpoint de escritura recibe un cuerpo vacío. El permiso se evalúa antes que el cuerpo,
//   así que 403 = rechazado por rol y cualquier otro estado (400, 404...) = el rol pasó la puerta
//   sin crear nada. Parte 2: el flujo real de cada rol con datos de verdad.
process.env.RATE_LIMIT_MAX = "100000";

jest.mock("../src/services/pdf.service", () => ({}));
jest.mock("../src/services/email.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendTemplateEmail: jest.fn().mockResolvedValue(undefined),
}));

import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require("../src/config/env");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../src/lib/prisma");

const tag = `rw-${Date.now()}`;
const ID = randomUUID(); // un id válido que no existe

type Method = "post" | "patch" | "put" | "delete";
const WRITES: Array<[Method, string, string]> = [
  // [método, ruta, permiso que exige]
  ["post", "/api/clients", "CREATE_CLIENT"],
  ["post", "/api/clients/import", "CREATE_CLIENT"],
  ["patch", `/api/clients/${ID}`, "CREATE_CLIENT"],
  ["patch", `/api/clients/${ID}/toggle`, "CREATE_CLIENT"],
  ["delete", `/api/clients/${ID}`, "DELETE_CLIENT"],
  ["post", "/api/clients/birthday/preview", "SEND_BIRTHDAY_EMAILS"],
  ["post", "/api/clients/birthday", "SEND_BIRTHDAY_EMAILS"],
  ["post", "/api/requests", "MANAGE_REQUESTS"],
  ["post", `/api/requests/${ID}/duplicate`, "MANAGE_REQUESTS"],
  ["patch", `/api/requests/${ID}`, "MANAGE_REQUESTS"],
  ["patch", `/api/requests/${ID}/status`, "MANAGE_REQUESTS"],
  ["delete", `/api/requests/${ID}`, "DELETE_REQUEST"],
  ["post", "/api/services", "MANAGE_SERVICES"],
  ["patch", `/api/services/${ID}`, "MANAGE_SERVICES"],
  ["patch", `/api/services/${ID}/status`, "MANAGE_SERVICES"],
  ["delete", `/api/services/${ID}`, "DELETE_SERVICE"],
  ["post", "/api/quotations", "MANAGE_QUOTATIONS"],
  ["post", `/api/quotations/${ID}/duplicate`, "MANAGE_QUOTATIONS"],
  ["patch", `/api/quotations/${ID}`, "MANAGE_QUOTATIONS"],
  ["patch", `/api/quotations/${ID}/status`, "MANAGE_QUOTATIONS"],
  ["post", `/api/quotations/${ID}/send`, "MANAGE_QUOTATIONS"],
  ["post", `/api/quotations/${ID}/link`, "MANAGE_QUOTATIONS"],
  ["delete", `/api/quotations/${ID}`, "DELETE_QUOTATION"],
  ["post", "/api/confirmations", "MANAGE_CONFIRMATIONS"],
  ["patch", `/api/confirmations/${ID}`, "MANAGE_CONFIRMATIONS"],
  ["delete", `/api/confirmations/${ID}`, "DELETE_CONFIRMATION"],
  ["post", "/api/payments", "MANAGE_PAYMENTS"],
  ["patch", `/api/payments/${ID}`, "MANAGE_PAYMENTS"],
  ["patch", `/api/payments/${ID}/status`, "MANAGE_PAYMENTS"],
  ["delete", `/api/payments/${ID}`, "DELETE_PAYMENT"],
  ["post", "/api/providers", "MANAGE_PROVIDERS"],
  ["patch", `/api/providers/${ID}`, "MANAGE_PROVIDERS"],
  ["delete", `/api/providers/${ID}`, "DELETE_PROVIDER"],
  ["post", "/api/vouchers", "MANAGE_VOUCHERS"],
  ["patch", `/api/vouchers/${ID}`, "MANAGE_VOUCHERS"],
  ["patch", `/api/vouchers/${ID}/status`, "MANAGE_VOUCHERS"],
  ["delete", `/api/vouchers/${ID}`, "DELETE_VOUCHER"],
  ["post", "/api/email-templates", "MANAGE_TEMPLATES"],
  ["patch", `/api/email-templates/${ID}`, "MANAGE_TEMPLATES"],
  ["patch", `/api/email-templates/${ID}/toggle`, "MANAGE_TEMPLATES"],
  ["post", `/api/email-templates/${ID}/duplicate`, "MANAGE_TEMPLATES"],
  ["delete", `/api/email-templates/${ID}`, "DELETE_TEMPLATE"],
  ["post", "/api/countries", "MANAGE_CATALOGS"],
  ["patch", `/api/countries/${ID}`, "MANAGE_CATALOGS"],
  ["delete", `/api/countries/${ID}`, "MANAGE_CATALOGS"],
  ["post", "/api/cities", "MANAGE_CATALOGS"],
  ["patch", `/api/users/${ID}`, "MANAGE_USERS"],
  ["delete", `/api/users/${ID}`, "MANAGE_USERS"],
  ["post", "/api/system-config/sync", "MANAGE_SYSTEM_CONFIG"],
  ["put", "/api/permissions/roles/AGENTE_VENTAS", "MANAGE_PERMISSIONS"],
  ["post", `/api/permissions/users/${ID}`, "MANAGE_PERMISSIONS"],
  ["delete", "/api/activity-logs/purge", "PURGE_LOGS"],
];

// Lo que cada rol PUEDE escribir (lista a mano; todo lo demás debe dar 403).
const CAN: Record<string, string[]> = {
  GERENTE: [
    "CREATE_CLIENT", "DELETE_CLIENT", "SEND_BIRTHDAY_EMAILS", "MANAGE_REQUESTS", "DELETE_REQUEST",
    "MANAGE_SERVICES", "DELETE_SERVICE", "MANAGE_QUOTATIONS", "DELETE_QUOTATION", "MANAGE_CONFIRMATIONS",
    "DELETE_CONFIRMATION", "MANAGE_PAYMENTS", "DELETE_PAYMENT", "MANAGE_PROVIDERS", "DELETE_PROVIDER",
    "MANAGE_VOUCHERS", "DELETE_VOUCHER", "MANAGE_TEMPLATES", "DELETE_TEMPLATE", "MANAGE_CATALOGS",
    "MANAGE_USERS", "MANAGE_SYSTEM_CONFIG", "MANAGE_PERMISSIONS",
  ],
  AGENTE_VENTAS: ["CREATE_CLIENT", "SEND_BIRTHDAY_EMAILS", "MANAGE_REQUESTS", "MANAGE_SERVICES", "MANAGE_QUOTATIONS", "MANAGE_CONFIRMATIONS"],
  OPERACIONES: ["SEND_BIRTHDAY_EMAILS", "MANAGE_SERVICES", "MANAGE_CONFIRMATIONS", "MANAGE_PROVIDERS", "MANAGE_VOUCHERS"],
  FINANZAS: ["SEND_BIRTHDAY_EMAILS", "MANAGE_PAYMENTS"],
};

describe("permisos de escritura por rol (integración con Postgres)", () => {
  const users: Record<string, { id: string; email: string; role: string }> = {};
  const make = (key: string, data: Record<string, string>) =>
    prisma.user.create({ data: { email: `${tag}-${key}@example.com`, fullName: key, passwordHash: "x", ...data } });
  const token = (who: string) => jwt.sign({ id: users[who].id, email: users[who].email, role: users[who].role }, env.JWT_SECRET);
  const call = (who: string, method: Method, path: string, body: object = {}) =>
    request(app)[method](path).set("Authorization", `Bearer ${token(who)}`).send(body);

  beforeAll(async () => {
    users.ADMIN = await make("admin", { role: "ADMINISTRADOR" });
    for (const r of Object.keys(CAN)) users[r] = await make(r, { role: "USUARIO", agencyRole: r });
    users.SIN_ROL = await make("sinrol", { role: "USUARIO" });
  });

  afterAll(async () => {
    const ids = Object.values(users).map((u) => u.id);
    await prisma.activityLog.deleteMany({ where: { performedBy: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  describe.each(Object.keys(CAN))("rol %s: puerta de cada endpoint de escritura", (role) => {
    it("pasa solo donde su matriz lo permite y recibe 403 en el resto", async () => {
      const actual: Record<string, string> = {};
      const expected: Record<string, string> = {};
      for (const [method, path, perm] of WRITES) {
        const key = `${method.toUpperCase()} ${path.replace(ID, ":id")}`;
        const res = await call(role, method, path);
        actual[key] = res.status === 403 ? "403" : res.status === 401 ? "401" : "pasa";
        expected[key] = CAN[role].includes(perm) ? "pasa" : "403";
      }
      expect(actual).toEqual(expected);
    });
  });

  it("un usuario sin rol de agencia recibe 403 en toda escritura con permiso", async () => {
    for (const [method, path] of WRITES) {
      expect([method, path, (await call("SIN_ROL", method, path)).status]).toEqual([method, path, 403]);
    }
  });

  it("sin token, toda escritura devuelve 401", async () => {
    for (const [method, path] of WRITES) {
      const res = await request(app)[method](path).send({});
      expect([method, path, res.status]).toEqual([method, path, 401]);
    }
  });
  describe("flujo real de cada rol con datos de verdad", () => {
    const made: { clients: string[]; providers: string[]; requests: string[] } = { clients: [], providers: [], requests: [] };
    // Si falla, el mensaje de la API aparece en la diferencia.
    const status = (r: { status: number; body: unknown }) => ({ status: r.status, error: r.status >= 400 ? r.body : undefined });
    const ok = (r: { status: number; body: unknown }, code: number) => expect(status(r)).toEqual({ status: code, error: undefined });

    afterAll(async () => {
      const where = { requestId: { in: made.requests } };
      await prisma.voucher.deleteMany({ where });
      await prisma.payment.deleteMany({ where });
      await prisma.confirmation.deleteMany({ where });
      await prisma.quotation.deleteMany({ where });
      await prisma.notification.deleteMany({ where: { relatedEntityId: { in: made.requests } } });
      await prisma.request.deleteMany({ where: { id: { in: made.requests } } });
      await prisma.provider.deleteMany({ where: { id: { in: made.providers } } });
      await prisma.client.deleteMany({ where: { id: { in: made.clients } } });
    });

    let clientId: string;
    let requestId: string;
    let quotationId: string;
    let providerId: string;
    let paymentId: string;

    it("AGENTE_VENTAS crea cliente, solicitud y cotización, y la lleva a aceptada", async () => {
      const c = await call("AGENTE_VENTAS", "post", "/api/clients", { firstName: "Rol", lastName: `Escritura ${tag}`, email: `${tag}@cliente.cl` });
      ok(c, 201);
      clientId = c.body.data.id;
      made.clients.push(clientId);

      const r = await call("AGENTE_VENTAS", "post", "/api/requests", { clientId, isPackage: true, destinationCountry: "Chile", destinationCity: "Santiago" });
      ok(r, 201);
      requestId = r.body.data.id;
      made.requests.push(requestId);

      const q = await call("AGENTE_VENTAS", "post", "/api/quotations", {
        requestId, clientId, currency: "CLP", taxPercentage: 19, discount: 0, validUntil: "2099-12-31",
        items: [{ service: "Hotel", description: "", quantity: 1, unitPrice: 100000, total: 0 }],
      });
      ok(q, 201);
      expect(q.body.data.total).toBe(119000);
      quotationId = q.body.data.id;

      ok(await call("AGENTE_VENTAS", "patch", `/api/quotations/${quotationId}/status`, { status: "ENVIADA" }), 200);
      ok(await call("AGENTE_VENTAS", "patch", `/api/quotations/${quotationId}/status`, { status: "ACEPTADA" }), 200);
    });

    it("AGENTE_VENTAS no puede cobrar, emitir vouchers, crear proveedores ni borrar su solicitud", async () => {
      const res = await Promise.all([
        call("AGENTE_VENTAS", "post", "/api/payments", { requestId, amount: 119000, currency: "CLP", method: "EFECTIVO" }),
        call("AGENTE_VENTAS", "post", "/api/vouchers", { requestId }),
        call("AGENTE_VENTAS", "post", "/api/providers", { name: `Prov ${tag}` }),
        call("AGENTE_VENTAS", "delete", `/api/requests/${requestId}`),
        call("AGENTE_VENTAS", "delete", `/api/quotations/${quotationId}`),
      ]);
      expect(res.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    });

    it("OPERACIONES crea proveedor, confirmación y voucher en borrador sobre esa solicitud", async () => {
      const p = await call("OPERACIONES", "post", "/api/providers", { name: `Proveedor ${tag}` });
      ok(p, 201);
      providerId = p.body.data.id;
      made.providers.push(providerId);

      const c = await call("OPERACIONES", "post", "/api/confirmations", { requestId, providerId, price: 80000, providerConfirmationNumber: "CONF-1" });
      ok(c, 201);

      const v = await call("OPERACIONES", "post", "/api/vouchers", { requestId, providerId, serviceName: "Hotel", amount: 80000, currency: "CLP" });
      ok(v, 201);
      expect(v.body.data.status).toBe("BORRADOR");
    });

    it("OPERACIONES no puede cotizar, cobrar ni cambiar el estado de la solicitud", async () => {
      const res = await Promise.all([
        call("OPERACIONES", "post", "/api/quotations", { requestId, clientId, items: [] }),
        call("OPERACIONES", "post", "/api/payments", { requestId, amount: 119000, currency: "CLP", method: "EFECTIVO" }),
        call("OPERACIONES", "patch", `/api/requests/${requestId}/status`, { status: "CANCELADA" }),
        call("OPERACIONES", "delete", `/api/vouchers/${randomUUID()}`),
      ]);
      expect(res.map((r) => r.status)).toEqual([403, 403, 403, 403]);
    });

    it("FINANZAS registra el pago por el total de la cotización aceptada", async () => {
      const parcial = await call("FINANZAS", "post", "/api/payments", { requestId, amount: 50000, currency: "CLP", method: "TRANSFERENCIA" });
      expect(parcial.status).not.toBe(403);
      expect(parcial.status).toBeGreaterThanOrEqual(400); // pagos parciales rechazados por regla de negocio

      const total = await call("FINANZAS", "post", "/api/payments", { requestId, amount: 119000, currency: "CLP", method: "TRANSFERENCIA" });
      ok(total, 201);
      paymentId = total.body.data.id;
      ok(await call("FINANZAS", "patch", `/api/payments/${paymentId}/status`, { status: "COMPLETADO" }), 200);
    });

    it("FINANZAS no puede crear solicitudes, tocar cotizaciones, emitir vouchers ni borrar el pago", async () => {
      const res = await Promise.all([
        call("FINANZAS", "post", "/api/requests", { clientId }),
        call("FINANZAS", "patch", `/api/quotations/${quotationId}/status`, { status: "RECHAZADA" }),
        call("FINANZAS", "post", "/api/vouchers", { requestId }),
        call("FINANZAS", "post", "/api/confirmations", { requestId, providerId, price: 1 }),
        call("FINANZAS", "delete", `/api/payments/${paymentId}`),
      ]);
      expect(res.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    });

    it("las tareas son de cualquier usuario autenticado: los tres roles pueden crear la suya", async () => {
      const created: string[] = [];
      for (const role of ["AGENTE_VENTAS", "OPERACIONES", "FINANZAS"]) {
        const res = await call(role, "post", "/api/tasks", { title: `Tarea ${role} ${tag}`, dueDate: "2099-12-31", priority: "MEDIA" });
        ok(res, 201);
        created.push(res.body.data.id);
      }
      await prisma.task.deleteMany({ where: { id: { in: created } } });
    });
  });
});
