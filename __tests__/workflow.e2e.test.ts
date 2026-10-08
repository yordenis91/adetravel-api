// Flujo de 17 estados de Solicitud y Servicio, avances automáticos, vouchers y la tarea de
// atrasos, contra Postgres real (npm run test:e2e). El correo está simulado: nunca sale nada.
process.env.RATE_LIMIT_MAX = "100000";

jest.mock("../src/services/pdf.service", () => ({}));
jest.mock("../src/services/email.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendTemplateEmail: jest.fn().mockResolvedValue(undefined),
}));

import jwt from "jsonwebtoken";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require("../src/config/env");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../src/lib/prisma");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { advanceWorkflowStatus } = require("../src/services/workflow.service");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runOverdueNotificationsJob } = require("../src/jobs/overdueNotifications.job");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const email = require("../src/services/email.service");

const tag = `wf-${Date.now()}`;
let seq = 0;

// Camino feliz completo (16 estados; CANCELADA queda fuera).
const HAPPY_PATH = [
  "RECEPCIONADA",
  "SERVICIOS_ASIGNADOS_PARA_COTIZAR",
  "ENVIADO_A_PROVEEDOR",
  "COTIZADO_POR_PROVEEDOR",
  "COTIZADO_POR_ADETRAVEL",
  "ENVIADO_AL_CLIENTE",
  "ACEPTADA_POR_CLIENTE",
  "ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR",
  "CONFIRMADA_POR_PROVEEDOR",
  "ENVIADA_CONFIRMACION_CLIENTE",
  "ENVIADA_SOLICITUD_PAGO_CLIENTE",
  "PAGADO_POR_CLIENTE",
  "PAGADO_AL_PROVEEDOR",
  "VOUCHER_EMITIDO",
  "VOUCHER_ENTREGADO",
  "VENDIDA",
];

describe("flujo de trabajo de Solicitud y Servicio (integración con Postgres)", () => {
  const u: Record<string, any> = {};
  let client: any;
  let provider: any;
  const requestIds: string[] = [];

  beforeAll(async () => {
    u.admin = await prisma.user.create({ data: { email: `${tag}-a@example.com`, fullName: "A", passwordHash: "x", role: "ADMINISTRADOR" } });
    u.ventas = await prisma.user.create({ data: { email: `${tag}-v@example.com`, fullName: "V", passwordHash: "x", role: "USUARIO", agencyRole: "AGENTE_VENTAS" } });
    u.ops = await prisma.user.create({ data: { email: `${tag}-o@example.com`, fullName: "O", passwordHash: "x", role: "USUARIO", agencyRole: "OPERACIONES" } });
    client = await prisma.client.create({ data: { firstName: "Flujo", lastName: "Prueba", email: `${tag}@cliente.cl` } });
    provider = await prisma.provider.create({ data: { name: `Proveedor ${tag}` } });
  });

  afterAll(async () => {
    const where = { requestId: { in: requestIds } };
    await prisma.voucher.deleteMany({ where });
    await prisma.confirmation.deleteMany({ where });
    await prisma.service.deleteMany({ where });
    await prisma.notification.deleteMany({ where: { relatedEntityId: { in: requestIds } } });
    await prisma.activityLog.deleteMany({ where: { entityLabel: { startsWith: tag } } });
    await prisma.request.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.provider.deleteMany({ where: { id: provider?.id } });
    await prisma.client.deleteMany({ where: { id: client?.id } });
    await prisma.notification.deleteMany({ where: { userId: { in: Object.values(u).map((x: any) => x.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(u).map((x: any) => x.id) } } });
    await prisma.$disconnect();
  });

  const token = (who: string) => jwt.sign({ id: u[who].id, email: u[who].email, role: u[who].role }, env.JWT_SECRET);
  const patch = (who: string, path: string, body: object) =>
    request(app).patch(path).set("Authorization", `Bearer ${token(who)}`).send(body);
  const post = (who: string, path: string, body: object) =>
    request(app).post(path).set("Authorization", `Bearer ${token(who)}`).send(body);

  async function newRequest(opts: { isPackage?: boolean; services?: number; withProvider?: boolean; createdBy?: string | null } = {}) {
    seq += 1;
    const req = await prisma.request.create({
      data: {
        requestNumber: `${tag}-R${seq}`,
        clientId: client.id,
        isPackage: opts.isPackage ?? false,
        createdBy: opts.createdBy === undefined ? u.ops.id : opts.createdBy,
      },
    });
    requestIds.push(req.id);
    const services = [];
    for (let i = 0; i < (opts.services ?? 0); i++) {
      services.push(
        await prisma.service.create({
          data: {
            serviceNumber: `${tag}-R${seq}-S${i}`,
            requestId: req.id,
            type: "SEGURO",
            details: {},
            providerId: opts.withProvider === false ? null : provider.id,
          },
        })
      );
    }
    return { req, services };
  }

  const statusOf = async (model: "request" | "service", id: string) =>
    (await prisma[model].findUnique({ where: { id }, select: { status: true } })).status;

  describe("Solicitud", () => {
    it("recorre los 16 estados del camino feliz y en modo paquete arrastra a sus servicios", async () => {
      const { req, services } = await newRequest({ isPackage: true, services: 2 });

      for (const status of HAPPY_PATH.slice(1)) {
        const res = await patch("ventas", `/api/requests/${req.id}/status`, { status });
        expect({ status, code: res.status }).toEqual({ status, code: 200 });
        for (const s of services) expect(await statusOf("service", s.id)).toBe(status);
      }

      // VENDIDA es terminal: ni siquiera se puede volver atrás.
      const res = await patch("ventas", `/api/requests/${req.id}/status`, { status: "RECEPCIONADA" });
      expect(res.status).toBe(409);
      expect(res.body.error?.code ?? res.body.code).toBe("INVALID_TRANSITION");
    });

    it("rechaza saltos de estado con 409 y no cambia nada", async () => {
      const { req } = await newRequest();
      for (const status of ["COTIZADO_POR_ADETRAVEL", "ACEPTADA_POR_CLIENTE", "PAGADO_POR_CLIENTE", "VENDIDA"]) {
        const res = await patch("ventas", `/api/requests/${req.id}/status`, { status });
        expect({ status, code: res.status }).toEqual({ status, code: 409 });
      }
      expect(await statusOf("request", req.id)).toBe("RECEPCIONADA");
    });

    it("rechaza un estado que no existe con 400", async () => {
      const { req } = await newRequest();
      const res = await patch("ventas", `/api/requests/${req.id}/status`, { status: "INVENTADO" });
      expect(res.status).toBe(400);
    });

    it("PATCH /requests/:id no permite cambiar el estado saltándose el flujo", async () => {
      const { req } = await newRequest();
      const res = await patch("ventas", `/api/requests/${req.id}`, { status: "VENDIDA", description: "editada" });
      expect(res.status).toBe(200);
      expect(await statusOf("request", req.id)).toBe("RECEPCIONADA");
    });

    it("permite las vueltas atrás del diagrama (cliente rechaza, proveedor no confirma)", async () => {
      const { req } = await newRequest();
      await prisma.request.update({ where: { id: req.id }, data: { status: "ENVIADO_AL_CLIENTE" } });
      expect((await patch("ventas", `/api/requests/${req.id}/status`, { status: "RECEPCIONADA" })).status).toBe(200);

      await prisma.request.update({ where: { id: req.id }, data: { status: "ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR" } });
      expect((await patch("ventas", `/api/requests/${req.id}/status`, { status: "ENVIADO_AL_CLIENTE" })).status).toBe(200);
    });
  });

  describe("cancelación", () => {
    it("exige motivo, lo guarda, arrastra a los servicios y permite reactivar", async () => {
      const { req, services } = await newRequest({ services: 2 });

      const sinMotivo = await patch("ventas", `/api/requests/${req.id}/status`, { status: "CANCELADA" });
      expect(sinMotivo.status).toBe(400);

      const res = await patch("ventas", `/api/requests/${req.id}/status`, { status: "CANCELADA", cancellationReason: "El cliente desiste" });
      expect(res.status).toBe(200);
      const saved = await prisma.request.findUnique({ where: { id: req.id } });
      expect(saved.status).toBe("CANCELADA");
      expect(saved.cancellationReason).toBe("El cliente desiste");
      for (const s of services) expect(await statusOf("service", s.id)).toBe("CANCELADA");

      // Una solicitud cancelada no admite servicios ni confirmaciones nuevas.
      const svc = await post("ops", "/api/services", {
        requestId: req.id, type: "VISA",
        details: { type: "VISA", fullName: "X", passportNumber: "P1", birthDate: "1990-01-01", nationality: "CL" },
      });
      expect(svc.status).toBe(409);
      const conf = await post("ops", "/api/confirmations", { requestId: req.id, providerId: provider.id, price: 10 });
      expect(conf.status).toBe(409);

      expect((await patch("ventas", `/api/requests/${req.id}/status`, { status: "RECEPCIONADA" })).status).toBe(200);
    });

    it("tras pagar solo el administrador puede cancelar (ni ventas)", async () => {
      const { req } = await newRequest();
      await prisma.request.update({ where: { id: req.id }, data: { status: "PAGADO_POR_CLIENTE" } });

      const ventas = await patch("ventas", `/api/requests/${req.id}/status`, { status: "CANCELADA", cancellationReason: "x" });
      expect(ventas.status).toBe(409);
      const admin = await patch("admin", `/api/requests/${req.id}/status`, { status: "CANCELADA", cancellationReason: "Fuerza mayor" });
      expect(admin.status).toBe(200);
      expect(await statusOf("request", req.id)).toBe("CANCELADA");
    });
  });

  describe("Servicio", () => {
    it("no pasa a cotizar sin proveedor asignado", async () => {
      const { services } = await newRequest({ services: 1, withProvider: false });
      const res = await patch("ops", `/api/services/${services[0].id}/status`, { status: "SERVICIOS_ASIGNADOS_PARA_COTIZAR" });
      expect(res.status).toBe(409);
      expect(await statusOf("service", services[0].id)).toBe("RECEPCIONADA");
    });

    it("la solicitud avanza solo cuando todos sus servicios alcanzan el estado", async () => {
      const { req, services } = await newRequest({ services: 2 });
      const [a, b] = services;

      expect((await patch("ops", `/api/services/${a.id}/status`, { status: "SERVICIOS_ASIGNADOS_PARA_COTIZAR" })).status).toBe(200);
      expect(await statusOf("request", req.id)).toBe("RECEPCIONADA");

      expect((await patch("ops", `/api/services/${b.id}/status`, { status: "SERVICIOS_ASIGNADOS_PARA_COTIZAR" })).status).toBe(200);
      expect(await statusOf("request", req.id)).toBe("SERVICIOS_ASIGNADOS_PARA_COTIZAR");
    });

    it("un servicio rechaza saltos y no se cancela sin motivo", async () => {
      const { services } = await newRequest({ services: 1 });
      expect((await patch("ops", `/api/services/${services[0].id}/status`, { status: "VENDIDA" })).status).toBe(409);
      expect((await patch("ops", `/api/services/${services[0].id}/status`, { status: "CANCELADA" })).status).toBe(400);
    });
  });

  describe("avances automáticos (advanceWorkflowStatus)", () => {
    it("nunca retrocede ni reactiva una solicitud cancelada", async () => {
      const { req } = await newRequest();
      await prisma.request.update({ where: { id: req.id }, data: { status: "ACEPTADA_POR_CLIENTE" } });
      await advanceWorkflowStatus(req.id, null, "COTIZADO_POR_ADETRAVEL");
      expect(await statusOf("request", req.id)).toBe("ACEPTADA_POR_CLIENTE");

      await prisma.request.update({ where: { id: req.id }, data: { status: "CANCELADA" } });
      await advanceWorkflowStatus(req.id, null, "PAGADO_POR_CLIENTE");
      expect(await statusOf("request", req.id)).toBe("CANCELADA");
    });

    it("a nivel servicio burbujea a la solicitud cuando todos llegan", async () => {
      const { req, services } = await newRequest({ services: 2 });
      await advanceWorkflowStatus(req.id, services[0].id, "COTIZADO_POR_ADETRAVEL");
      expect(await statusOf("request", req.id)).toBe("RECEPCIONADA");
      await advanceWorkflowStatus(req.id, services[1].id, "COTIZADO_POR_ADETRAVEL");
      expect(await statusOf("request", req.id)).toBe("COTIZADO_POR_ADETRAVEL");
    });

    it("a nivel solicitud (no paquete) solo arrastra a los servicios los estados de cascada", async () => {
      const { req, services } = await newRequest({ services: 1 });
      await advanceWorkflowStatus(req.id, null, "ENVIADO_AL_CLIENTE");
      expect(await statusOf("request", req.id)).toBe("ENVIADO_AL_CLIENTE");
      expect(await statusOf("service", services[0].id)).toBe("RECEPCIONADA");

      await advanceWorkflowStatus(req.id, null, "ACEPTADA_POR_CLIENTE");
      expect(await statusOf("service", services[0].id)).toBe("ACEPTADA_POR_CLIENTE");
    });

    it("registrar la confirmación del proveedor fija el precio y avanza el servicio", async () => {
      const { req, services } = await newRequest({ services: 1 });
      await prisma.service.update({ where: { id: services[0].id }, data: { status: "ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR" } });
      await prisma.request.update({ where: { id: req.id }, data: { status: "ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR" } });

      const res = await post("ops", "/api/confirmations", { requestId: req.id, serviceId: services[0].id, providerId: provider.id, price: 150000 });
      expect(res.status).toBe(201);
      const svc = await prisma.service.findUnique({ where: { id: services[0].id } });
      expect(svc.status).toBe("CONFIRMADA_POR_PROVEEDOR");
      expect(Number(svc.price)).toBe(150000);
      expect(await statusOf("request", req.id)).toBe("CONFIRMADA_POR_PROVEEDOR");
    });

    it("no registra una confirmación antes de que el cliente acepte ni sobre un servicio cancelado", async () => {
      const { req, services } = await newRequest({ services: 2 });
      await prisma.service.update({ where: { id: services[0].id }, data: { status: "COTIZADO_POR_ADETRAVEL" } });

      const pronto = await post("ops", "/api/confirmations", { requestId: req.id, serviceId: services[0].id, providerId: provider.id, price: 10 });
      expect(pronto.status).toBe(409);
      expect(pronto.body.error?.code ?? pronto.body.code).toBe("CONFIRMATION_TOO_EARLY");
      expect(await statusOf("service", services[0].id)).toBe("COTIZADO_POR_ADETRAVEL");
      expect(await prisma.confirmation.count({ where: { requestId: req.id } })).toBe(0);

      await prisma.service.update({ where: { id: services[1].id }, data: { status: "CANCELADA" } });
      const cancelado = await post("ops", "/api/confirmations", { requestId: req.id, serviceId: services[1].id, providerId: provider.id, price: 10 });
      expect(cancelado.status).toBe(409);
    });

    it("en un paquete aceptado, la confirmación sin servicio avanza la solicitud", async () => {
      const { req, services } = await newRequest({ isPackage: true, services: 1 });
      await prisma.request.update({ where: { id: req.id }, data: { status: "ACEPTADA_POR_CLIENTE" } });

      const res = await post("ops", "/api/confirmations", { requestId: req.id, providerId: provider.id, price: 99 });
      expect(res.status).toBe(201);
      expect(await statusOf("request", req.id)).toBe("CONFIRMADA_POR_PROVEEDOR");
      expect(await statusOf("service", services[0].id)).toBe("CONFIRMADA_POR_PROVEEDOR");
    });
  });

  describe("vouchers", () => {
    beforeEach(() => (email.sendTemplateEmail as jest.Mock).mockClear());

    it("borrador → emitido exige datos completos, avisa al cliente (correo simulado) y avanza la solicitud", async () => {
      const { req } = await newRequest();
      await prisma.request.update({ where: { id: req.id }, data: { status: "PAGADO_AL_PROVEEDOR" } });
      const created = await post("ops", "/api/vouchers", { requestId: req.id, serviceName: "Hotel Prueba" });
      expect(created.status).toBe(201);
      expect(created.body.data.status).toBe("BORRADOR");
      const id = created.body.data.id;

      const incompleto = await patch("ops", `/api/vouchers/${id}/status`, { status: "EMITIDO" });
      expect(incompleto.status).toBe(400);
      expect(email.sendTemplateEmail).not.toHaveBeenCalled();

      const completar = await patch("ops", `/api/vouchers/${id}`, { checkIn: "2026-12-01", checkOut: "2026-12-05", destination: "Cusco", providerId: provider.id });
      expect(completar.status).toBe(200);
      const emitido = await patch("ops", `/api/vouchers/${id}/status`, { status: "EMITIDO" });
      expect(emitido.status).toBe(200);
      expect(await statusOf("request", req.id)).toBe("VOUCHER_EMITIDO");

      const config = await prisma.systemConfig.findFirst();
      if (config?.notifyOnVoucherIssued !== false) {
        expect(email.sendTemplateEmail).toHaveBeenCalledTimes(1);
        expect((email.sendTemplateEmail as jest.Mock).mock.calls[0][0]).toMatchObject({ type: "VOUCHER_ISSUED", to: `${tag}@cliente.cl` });
      }

      // Emitido: no se edita ni se borra; se puede devolver a borrador.
      expect((await patch("ops", `/api/vouchers/${id}`, { serviceName: "Otro" })).status).toBe(409);
      expect((await request(app).delete(`/api/vouchers/${id}`).set("Authorization", `Bearer ${token("admin")}`)).status).toBe(409);
      expect((await patch("ops", `/api/vouchers/${id}/status`, { status: "BORRADOR" })).status).toBe(200);
      // Volver a borrador no hace retroceder la solicitud.
      expect(await statusOf("request", req.id)).toBe("VOUCHER_EMITIDO");
    });

    it("no emite antes del pago al proveedor ni sobre una solicitud cancelada", async () => {
      const completo = { serviceName: "Hotel", checkIn: "2026-12-01", checkOut: "2026-12-05", destination: "Cusco", providerId: provider.id };
      for (const [status, code] of [["PAGADO_POR_CLIENTE", "VOUCHER_TOO_EARLY"], ["CANCELADA", "REQUEST_CANCELLED"]]) {
        const { req } = await newRequest();
        await prisma.request.update({ where: { id: req.id }, data: { status } });
        const v = await post("ops", "/api/vouchers", { requestId: req.id, ...completo });
        const res = await patch("ops", `/api/vouchers/${v.body.data.id}/status`, { status: "EMITIDO" });
        expect({ status, code: res.status, error: res.body.error?.code ?? res.body.code }).toEqual({ status, code: 409, error: code });
        expect(await statusOf("request", req.id)).toBe(status);
      }
      expect(email.sendTemplateEmail).not.toHaveBeenCalled();
    });

    it("emitir con la solicitud ya más avanzada no la hace retroceder", async () => {
      const { req } = await newRequest();
      await prisma.request.update({ where: { id: req.id }, data: { status: "VOUCHER_ENTREGADO" } });
      const v = await post("ops", "/api/vouchers", { requestId: req.id, serviceName: "Tour", checkIn: "2026-12-01", checkOut: "2026-12-02", destination: "Lima", providerId: provider.id });
      expect((await patch("ops", `/api/vouchers/${v.body.data.id}/status`, { status: "EMITIDO" })).status).toBe(200);
      expect(await statusOf("request", req.id)).toBe("VOUCHER_ENTREGADO");
    });

    it("un voucher cancelado solo vuelve a borrador", async () => {
      const { req } = await newRequest();
      const v = await prisma.voucher.create({ data: { voucherNumber: `${tag}-V${seq}`, requestId: req.id, clientId: client.id, status: "CANCELADO" } });
      expect((await patch("ops", `/api/vouchers/${v.id}/status`, { status: "EMITIDO" })).status).toBe(409);
      expect((await patch("ops", `/api/vouchers/${v.id}/status`, { status: "BORRADOR" })).status).toBe(200);
    });
  });

  describe("tarea de atrasos (runOverdueNotificationsJob)", () => {
    const backdate = (id: string, hours: number) =>
      prisma.$executeRaw`UPDATE "requests" SET "updatedAt" = now() - make_interval(hours => ${hours}::int) WHERE id = ${id}`;

    it("avisa una sola vez por permanencia y no avisa antes de 24 h", async () => {
      const { req: atrasada } = await newRequest();
      const { req: reciente } = await newRequest();
      for (const r of [atrasada, reciente]) {
        await prisma.request.update({ where: { id: r.id }, data: { status: "ENVIADO_AL_CLIENTE" } });
      }
      await backdate(atrasada.id, 25);
      await backdate(reciente.id, 23);

      await runOverdueNotificationsJob();
      await runOverdueNotificationsJob();

      const avisos = await prisma.notification.findMany({ where: { relatedEntityId: { in: [atrasada.id, reciente.id] } } });
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toMatchObject({ relatedEntityId: atrasada.id, userId: u.ops.id, relatedEntityType: "REQUEST_OVERDUE_CLIENT_ACCEPTANCE" });
      expect(email.sendEmail).not.toHaveBeenCalled();
    });

    it("cubre los tres estados de espera y omite solicitudes sin dueño", async () => {
      const casos = [
        ["ENVIADA_SOLICITUD_PAGO_CLIENTE", "REQUEST_OVERDUE_PAYMENT"],
        ["ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR", "REQUEST_OVERDUE_PROVIDER_CONFIRMATION"],
      ];
      for (const [status, type] of casos) {
        const { req } = await newRequest();
        await prisma.request.update({ where: { id: req.id }, data: { status } });
        await backdate(req.id, 48);
        await runOverdueNotificationsJob();
        const aviso = await prisma.notification.findFirst({ where: { relatedEntityId: req.id } });
        expect({ status, type: aviso?.relatedEntityType }).toEqual({ status, type });
      }

      const { req: huerfana } = await newRequest({ createdBy: null });
      await prisma.request.update({ where: { id: huerfana.id }, data: { status: "ENVIADO_AL_CLIENTE" } });
      await backdate(huerfana.id, 48);
      await runOverdueNotificationsJob();
      expect(await prisma.notification.count({ where: { relatedEntityId: huerfana.id } })).toBe(0);
    });
  });
});
