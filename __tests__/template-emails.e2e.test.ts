// Correos automáticos con plantilla contra Postgres real: las etiquetas {{...}} se rellenan con datos reales (nunca
// llegan literales) y la felicitación de cumpleaños se previsualiza, se edita por cliente y se envía una vez al año.
// Correo (nodemailer) simulado. Requiere Postgres migrado (npm run test:e2e).
process.env.RATE_LIMIT_MAX = "100000";
process.env.EMAIL_DELIVERY = "live";
process.env.SMTP_HOST = "smtp.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "u";
process.env.SMTP_PASS = "p";
process.env.SMTP_FROM = "agencia@example.com";

const sendMail = jest.fn();
jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport: () => ({ sendMail }) }, createTransport: () => ({ sendMail }) }));

jest.mock("../src/services/pdf.service", () => ({
  generateQuotationPdfBuffer: jest.fn().mockResolvedValue(Buffer.from("%PDF-simulado")),
  generateVoucherPdfBuffer: jest.fn().mockResolvedValue(Buffer.from("%PDF-simulado")),
  buildQuotationHtml: jest.fn().mockReturnValue("<html></html>"),
}));

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require("../src/config/env");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../src/lib/prisma");

const tag = `te${process.pid}${Date.now()}`;

describe("correos automáticos con plantilla (integración con Postgres)", () => {
  let admin: { id: string; email: string; role: string };
  let client: { id: string; email: string };
  let noEmailClient: { id: string };
  const createdClientIds: string[] = [];
  const createdRequestIds: string[] = [];
  let savedConfig: { id: string; data: Record<string, unknown> } | null = null;
  let configCreatedId: string | null = null;
  let deactivated: string[] = [];

  const auth = () => ({ Authorization: `Bearer ${jwt.sign({ id: admin.id, email: admin.email, role: admin.role, tv: 0 }, env.JWT_SECRET)}` });
  const lastMail = () => sendMail.mock.calls[sendMail.mock.calls.length - 1][0];

  /** Deja como única plantilla activa del tipo la de la prueba (afterEach restaura las que había). */
  async function useTemplate(type: string, subject: string, bodyHtml: string) {
    const active = await prisma.emailTemplate.findMany({ where: { type, isActive: true }, select: { id: true } });
    deactivated.push(...active.map((t: { id: string }) => t.id));
    await prisma.emailTemplate.updateMany({ where: { id: { in: deactivated } }, data: { isActive: false } });
    await prisma.emailTemplate.create({ data: { name: `${tag}-tpl`, type, subject, bodyHtml, isActive: true } });
  }
  /** Sin plantilla activa de cumpleaños (para probar el diseño por defecto). */
  async function noTemplate(type: string) {
    const active = await prisma.emailTemplate.findMany({ where: { type, isActive: true }, select: { id: true } });
    deactivated.push(...active.map((t: { id: string }) => t.id));
    await prisma.emailTemplate.updateMany({ where: { id: { in: deactivated } }, data: { isActive: false } });
  }
  async function newClient(extra: Record<string, unknown> = {}) {
    const c = await prisma.client.create({ data: { firstName: "Ana", lastName: `Cumple ${tag}`, email: `${tag}-${createdClientIds.length}@example.com`, ...extra } });
    createdClientIds.push(c.id);
    return c;
  }
  const yearOf = async (id: string) => (await prisma.client.findUnique({ where: { id } })).lastBirthdayEmailYear;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("Inicial-2026!", 4);
    admin = await prisma.user.create({ data: { email: `${tag}-admin@example.com`, fullName: "Admin plantillas", passwordHash, role: "ADMINISTRADOR" } });
    client = await newClient();
    noEmailClient = await newClient({ email: null });
    const config = await prisma.systemConfig.findFirst();
    if (config) {
      savedConfig = { id: config.id, data: { notifyOnRequestCreated: config.notifyOnRequestCreated, agencyEmail: config.agencyEmail, agencyName: config.agencyName, agencyFantasyName: config.agencyFantasyName } };
      await prisma.systemConfig.update({ where: { id: config.id }, data: { notifyOnRequestCreated: true, agencyEmail: `${tag}-agencia@example.com`, agencyName: "Agencia Prueba", agencyFantasyName: null } });
    } else {
      configCreatedId = (await prisma.systemConfig.create({ data: { notifyOnRequestCreated: true, agencyEmail: `${tag}-agencia@example.com`, agencyName: "Agencia Prueba" } })).id;
    }
  });

  afterAll(async () => {
    await prisma.request.deleteMany({ where: { id: { in: createdRequestIds } } });
    await prisma.activityLog.deleteMany({ where: { performedBy: admin.id } });
    await prisma.notification.deleteMany({ where: { userId: admin.id } });
    await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
    await prisma.emailTemplate.deleteMany({ where: { name: `${tag}-tpl` } });
    if (savedConfig) await prisma.systemConfig.update({ where: { id: savedConfig.id }, data: savedConfig.data });
    if (configCreatedId) await prisma.systemConfig.delete({ where: { id: configCreatedId } });
    await prisma.user.deleteMany({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.emailTemplate.deleteMany({ where: { name: `${tag}-tpl` } });
    if (deactivated.length) await prisma.emailTemplate.updateMany({ where: { id: { in: deactivated } }, data: { isActive: true } });
    deactivated = [];
  });

  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({});
    env.EMAIL_DELIVERY = "live";
  });

  describe("Nueva solicitud recibida (aviso a la agencia)", () => {
    it("llega con el cliente, número, destino y fecha reales, sin etiquetas literales", async () => {
      await useTemplate("REQUEST_CREATED", "Nueva solicitud {{request_number}}", "<p>{{client_name}} pide {{destination}} el {{request_date}}. {{request_number}} — {{agency_name}} {{inventada}}</p>");
      const res = await request(app).post("/api/requests").set(auth()).send({
        clientId: client.id, isPackage: true, requestDate: "2026-10-10", destinationCity: "París", destinationCountry: "Francia",
      });
      expect(res.status).toBe(201);
      createdRequestIds.push(res.body.data.id);
      const mail = lastMail();
      expect(mail.to).toEqual([`${tag}-agencia@example.com`]);
      expect(mail.subject).toBe(`Nueva solicitud ${res.body.data.requestNumber}`);
      expect(mail.html).toBe(`<p>Ana Cumple ${tag} pide París, Francia el 10/10/2026. ${res.body.data.requestNumber} — Agencia Prueba </p>`);
      expect(mail.html).not.toContain("{{");
    });
  });

  describe("felicitación de cumpleaños", () => {
    it("la plantilla por defecto existe y se puede editar desde Configuración", async () => {
      const res = await request(app).get("/api/email-templates?type=BIRTHDAY_GREETING").set(auth());
      expect(res.status).toBe(200);
      expect(res.body.data.some((t: { bodyHtml: string }) => t.bodyHtml.includes("{{message}}"))).toBe(true);
      const create = await request(app).post("/api/email-templates").set(auth()).send({ name: `${tag}-tpl`, type: "BIRTHDAY_GREETING", subject: "Hola {{client_name}}", bodyHtml: "<p>{{message}}</p>" });
      expect(create.status).toBe(201);
      const bad = await request(app).post("/api/email-templates").set(auth()).send({ name: `${tag}-tpl`, type: "BIRTHDAY_GREETING", subject: "x", bodyHtml: "<p>{{request_number}}</p>" });
      expect(bad.status).toBe(400);
    });

    it("la vista previa usa la plantilla activa con el nombre del cliente y el saludo por defecto", async () => {
      const res = await request(app).post("/api/clients/birthday/preview").set(auth()).send({ clientId: client.id });
      expect(res.status).toBe(200);
      expect(res.body.data.subject).toContain("Ana");
      expect(res.body.data.html).toContain(`Ana Cumple ${tag}`);
      expect(res.body.data.html).toContain(res.body.data.message);
      expect(res.body.data.html).not.toContain("{{");
    });

    it("sin plantilla activa usa el diseño por defecto, y un saludo editado se escapa y respeta los párrafos", async () => {
      await noTemplate("BIRTHDAY_GREETING");
      const res = await request(app).post("/api/clients/birthday/preview").set(auth()).send({ clientId: client.id, message: "Feliz día <b>Ana</b>\n\nTe esperamos en Cusco" });
      expect(res.status).toBe(200);
      expect(res.body.data.html).toContain("¡Feliz Cumpleaños!");
      expect(res.body.data.html).toContain("Feliz día &lt;b&gt;Ana&lt;/b&gt;");
      expect(res.body.data.html).toContain("<p");
      expect(res.body.data.html).not.toContain("<b>Ana</b>");
    });

    it("envía lo mismo que se previsualizó, con el saludo editado de ese cliente, y solo una vez al año", async () => {
      const c = await newClient();
      const message = "Ana, ¡que sea con ese viaje a Cusco!";
      const preview = await request(app).post("/api/clients/birthday/preview").set(auth()).send({ clientId: c.id, message });
      const res = await request(app).post("/api/clients/birthday").set(auth()).send({ clientIds: [c.id], messages: { [c.id]: message } });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ sent: 1, skipped: 0, failed: 0 });
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(lastMail().to).toEqual([c.email]);
      expect(lastMail().html).toBe(preview.body.data.html);
      expect(lastMail().subject).toBe(preview.body.data.subject);
      expect(lastMail().html).toContain("viaje a Cusco");
      expect(await yearOf(c.id)).toBe(new Date().getFullYear());

      const again = await request(app).post("/api/clients/birthday").set(auth()).send({ clientIds: [c.id] });
      expect(again.body).toMatchObject({ sent: 0, skipped: 1 });
      expect(again.body.results[0].outcome).toBe("already-sent");
      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it("dos envíos simultáneos no duplican el correo", async () => {
      const c = await newClient();
      const [a, b] = await Promise.all([1, 2].map(() => request(app).post("/api/clients/birthday").set(auth()).send({ clientIds: [c.id] })));
      expect(a.body.sent + b.body.sent).toBe(1);
      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it("si el correo no sale (entrega apagada) no marca al cliente como felicitado: se puede reintentar", async () => {
      const c = await newClient();
      env.EMAIL_DELIVERY = "off";
      const res = await request(app).post("/api/clients/birthday").set(auth()).send({ clientIds: [c.id] });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ sent: 0, failed: 1 });
      expect(res.body.results[0].outcome).toBe("not-delivered");
      expect(await yearOf(c.id)).toBeNull();
      env.EMAIL_DELIVERY = "live";
      const retry = await request(app).post("/api/clients/birthday").set(auth()).send({ clientIds: [c.id] });
      expect(retry.body.sent).toBe(1);
    });

    it("si el SMTP falla tampoco marca al cliente y avisa cuál falló", async () => {
      const c = await newClient();
      sendMail.mockRejectedValueOnce(new Error("smtp caído"));
      const res = await request(app).post("/api/clients/birthday").set(auth()).send({ clientIds: [c.id] });
      expect(res.body).toMatchObject({ sent: 0, failed: 1 });
      expect(res.body.results[0]).toEqual({ clientId: c.id, outcome: "failed" });
      expect(await yearOf(c.id)).toBeNull();
    });

    it("un cliente sin correo se omite sin impedir el resto", async () => {
      const c = await newClient();
      const res = await request(app).post("/api/clients/birthday").set(auth()).send({ clientIds: [noEmailClient.id, c.id] });
      expect(res.body).toMatchObject({ sent: 1, skipped: 1 });
      expect(res.body.results.find((r: { clientId: string }) => r.clientId === noEmailClient.id).outcome).toBe("no-email");
    });

    it("valida los datos y exige sesión", async () => {
      expect((await request(app).post("/api/clients/birthday").set(auth()).send({ clientIds: [] })).status).toBe(400);
      expect((await request(app).post("/api/clients/birthday").set(auth()).send({ clientIds: ["x"] })).status).toBe(400);
      expect((await request(app).post("/api/clients/birthday/preview").set(auth()).send({ clientId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
      expect((await request(app).post("/api/clients/birthday").send({ clientIds: [client.id] })).status).toBe(401);
    });
  });
});
