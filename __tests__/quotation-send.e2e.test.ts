// Envío de cotizaciones por correo contra Postgres real: borrador editable, envío con PDF adjunto, cambio de
// estado solo si el correo salió, reenvío, errores honestos y permisos. Correo (nodemailer) y PDF simulados.
// Requiere Postgres migrado (npm run test:e2e).
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require("../src/services/pdf.service");

const tag = `qs${process.pid}${Date.now()}`;

describe("enviar cotización por correo (integración con Postgres)", () => {
  type Person = { id: string; email: string; role: string };
  let admin: Person;
  let finanzas: Person;
  let client: { id: string; email: string };
  const requestIds: string[] = [];
  let deactivatedTemplates: string[] = [];
  /** Deja como única plantilla activa "Cotización enviada" la de la prueba; afterEach restaura las que había. */
  async function useTemplate(subject: string, bodyHtml: string) {
    const active = await prisma.emailTemplate.findMany({ where: { type: "QUOTATION_SENT", isActive: true }, select: { id: true } });
    deactivatedTemplates = active.map((t: { id: string }) => t.id);
    await prisma.emailTemplate.updateMany({ where: { id: { in: deactivatedTemplates } }, data: { isActive: false } });
    await prisma.emailTemplate.create({ data: { name: `${tag}-tpl`, type: "QUOTATION_SENT", subject, bodyHtml, isActive: true } });
  }
  const tokenOf = (u: Person) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email, role: u.role, tv: 0 }, env.JWT_SECRET)}` });
  const auth = () => tokenOf(admin);
  const send = (id: string, body: object, headers = auth()) => request(app).post(`/api/quotations/${id}/send`).set(headers).send(body);
  const valid = (extra: object = {}) => ({ to: [client.email], subject: "Tu cotización", message: "Hola Ana,\n\nAdjunto la propuesta.", ...extra });
  const statusOf = async (id: string) => (await prisma.quotation.findUnique({ where: { id } })).status;
  const codeOf = (res: { body: { error?: { code?: string }; code?: string } }) => res.body.error?.code ?? res.body.code;

  async function newQuotation(extra: Record<string, unknown> = {}) {
    const r = await prisma.request.create({ data: { requestNumber: `${tag}-R${requestIds.length}`, clientId: client.id, isPackage: true, createdBy: admin.id } });
    requestIds.push(r.id);
    const res = await request(app).post("/api/quotations").set(auth()).send({
      requestId: r.id, clientId: client.id, currency: "CLP", taxPercentage: 19, discount: 0, validUntil: "2099-12-31",
      items: [{ service: "Hotel", description: "3 noches", quantity: 1, unitPrice: 100000, total: 0 }], ...extra,
    });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("Inicial-2026!", 4);
    admin = await prisma.user.create({ data: { email: `${tag}-admin@example.com`, fullName: "Admin envío", passwordHash, role: "ADMINISTRADOR" } });
    finanzas = await prisma.user.create({ data: { email: `${tag}-fin@example.com`, fullName: "Finanzas envío", passwordHash, role: "USUARIO", agencyRole: "FINANZAS" } });
    client = await prisma.client.create({ data: { firstName: "Ana", lastName: `Envío ${tag}`, email: `${tag}-ana@example.com`, additionalEmails: [`${tag}-conta@example.com`] } });
  });

  afterAll(async () => {
    const where = { requestId: { in: requestIds } };
    await prisma.service.deleteMany({ where });
    await prisma.quotation.deleteMany({ where });
    await prisma.notification.deleteMany({ where: { userId: { in: [admin.id, finanzas.id] } } });
    await prisma.activityLog.deleteMany({ where: { performedBy: { in: [admin.id, finanzas.id] } } });
    await prisma.request.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.client.deleteMany({ where: { id: client.id } });
    await prisma.emailTemplate.deleteMany({ where: { name: `${tag}-tpl` } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, finanzas.id] } } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.emailTemplate.deleteMany({ where: { name: `${tag}-tpl` } });
    if (deactivatedTemplates.length) await prisma.emailTemplate.updateMany({ where: { id: { in: deactivatedTemplates } }, data: { isActive: true } });
    deactivatedTemplates = [];
  });

  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({});
    env.EMAIL_DELIVERY = "live";
    pdf.generateQuotationPdfBuffer.mockResolvedValue(Buffer.from("%PDF-simulado"));
  });

  describe("borrador", () => {
    it("trae los destinatarios del cliente (principal y adicionales), asunto, mensaje editable y el modo de entrega", async () => {
      const q = await newQuotation();
      const res = await request(app).get(`/api/quotations/${q.id}/email-draft`).set(auth());
      expect(res.status).toBe(200);
      expect(res.body.data.recipients).toEqual({ primary: client.email, additional: [`${tag}-conta@example.com`] });
      expect(res.body.data.subject).toContain(q.quotationNumber);
      expect(res.body.data.message).toContain("Hola Ana,");
      expect(res.body.data.message).toContain(q.quotationNumber);
      expect(res.body.data.message).toContain("CLP 119.000");
      expect(res.body.data.attachmentName).toBe(`${q.quotationNumber}.pdf`);
      expect(res.body.data).toMatchObject({ deliveryMode: "live", status: "BORRADOR" });
      expect(sendMail).not.toHaveBeenCalled(); // pedir el borrador no envía nada
    });

    it("el asunto sale de la plantilla activa 'Cotización enviada' con sus variables", async () => {
      await useTemplate("Propuesta {{quotation_number}} para {{client_name}}", "<p>x</p>");
      const q = await newQuotation();
      const res = await request(app).get(`/api/quotations/${q.id}/email-draft`).set(auth());
      expect(res.body.data.subject).toBe(`Propuesta ${q.quotationNumber} para Ana`);
    });

    it("404 si la cotización no existe y 403 sin permiso", async () => {
      expect((await request(app).get("/api/quotations/00000000-0000-0000-0000-000000000000/email-draft").set(auth())).status).toBe(404);
      const q = await newQuotation();
      expect((await request(app).get(`/api/quotations/${q.id}/email-draft`).set(tokenOf(finanzas))).status).toBe(403);
    });
  });

  describe("envío", () => {
    it("envía con el PDF adjunto, el asunto y el mensaje editados, y pasa de Borrador a Enviada", async () => {
      const q = await newQuotation();
      const res = await send(q.id, valid({ to: [client.email, `${tag}-conta@example.com`], message: "Hola Ana,\n\nTe dejo la <b>propuesta</b> final." }));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ sent: true, recipients: 2, statusChanged: true });
      expect(res.body.data.quotation.status).toBe("ENVIADA");
      expect(await statusOf(q.id)).toBe("ENVIADA");

      expect(sendMail).toHaveBeenCalledTimes(1);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toEqual([client.email, `${tag}-conta@example.com`]);
      expect(mail.subject).toBe("Tu cotización");
      expect(mail.attachments).toEqual([expect.objectContaining({ filename: `${q.quotationNumber}.pdf`, contentType: "application/pdf" })]);
      expect(mail.html).toContain("Te dejo la &lt;b&gt;propuesta&lt;/b&gt; final."); // el HTML escrito se escapa
      expect(mail.html).not.toContain("<b>propuesta</b>");
      expect(mail.html).toContain(q.quotationNumber);

      // la solicitud avanza en el flujo, igual que al cambiar el estado a mano
      const r = await prisma.request.findUnique({ where: { id: q.requestId } });
      expect(r.status).toBe("ENVIADO_AL_CLIENTE");
    });

    it("deja constancia en la bitácora sin guardar las direcciones completas", async () => {
      const q = await newQuotation();
      await send(q.id, valid());
      const log = await prisma.activityLog.findFirst({ where: { entityId: q.id, performedBy: admin.id, description: { contains: "Enviada por correo" } } });
      expect(log).not.toBeNull();
      expect(log.description).not.toContain(client.email);
      expect(log.description).toContain("***@");
    });

    it("una cotización ya enviada se puede reenviar: el estado no cambia", async () => {
      const q = await newQuotation();
      await send(q.id, valid());
      const again = await send(q.id, valid({ to: [`${tag}-conta@example.com`] }));
      expect(again.status).toBe(200);
      expect(again.body.data).toMatchObject({ sent: true, statusChanged: false });
      expect(sendMail).toHaveBeenCalledTimes(2);
      expect(await statusOf(q.id)).toBe("ENVIADA");
    });

    it("no envía cotizaciones aceptadas o rechazadas", async () => {
      for (const status of ["ACEPTADA", "RECHAZADA"]) {
        const q = await newQuotation();
        await prisma.quotation.update({ where: { id: q.id }, data: { status } });
        const res = await send(q.id, valid());
        expect(res.status).toBe(409);
        expect(codeOf(res)).toBe("QUOTATION_NOT_SENDABLE");
      }
      expect(sendMail).not.toHaveBeenCalled();
    });

    it("no envía si la solicitud está cancelada ni si la cotización venció", async () => {
      const cancelled = await newQuotation();
      await prisma.request.update({ where: { id: cancelled.requestId }, data: { status: "CANCELADA" } });
      const res = await send(cancelled.id, valid());
      expect([res.status, codeOf(res)]).toEqual([409, "REQUEST_CANCELLED"]);

      const expired = await newQuotation();
      await prisma.quotation.update({ where: { id: expired.id }, data: { validUntil: "2020-01-01" } });
      const res2 = await send(expired.id, valid());
      if (env.BLOCK_EXPIRED_QUOTATIONS) expect([res2.status, codeOf(res2)]).toEqual([409, "QUOTATION_EXPIRED"]);
      expect(sendMail).not.toHaveBeenCalled();
      expect(await statusOf(cancelled.id)).toBe("BORRADOR");
    });
  });

  describe("errores honestos: si no salió, no cambia nada", () => {
    it("falla el servidor de correo: 502 y la cotización sigue en Borrador", async () => {
      sendMail.mockRejectedValue(new Error("ECONNREFUSED"));
      const q = await newQuotation();
      const res = await send(q.id, valid());
      expect([res.status, codeOf(res)]).toEqual([502, "EMAIL_SEND_FAILED"]);
      expect(await statusOf(q.id)).toBe("BORRADOR");
    });

    it("envío desactivado en el entorno: lo dice y no cambia el estado", async () => {
      env.EMAIL_DELIVERY = "off";
      const q = await newQuotation();
      const res = await send(q.id, valid());
      expect([res.status, codeOf(res)]).toEqual([409, "EMAIL_NOT_SENT"]);
      expect(JSON.stringify(res.body)).toMatch(/desactivado/);
      expect(sendMail).not.toHaveBeenCalled();
      expect(await statusOf(q.id)).toBe("BORRADOR");
    });

    it("no se pudo generar el PDF: no se envía nada", async () => {
      pdf.generateQuotationPdfBuffer.mockRejectedValue(new Error("boom"));
      const q = await newQuotation();
      const res = await send(q.id, valid());
      expect([res.status, codeOf(res)]).toEqual([500, "PDF_FAILED"]);
      expect(sendMail).not.toHaveBeenCalled();
      expect(await statusOf(q.id)).toBe("BORRADOR");
    });
  });

  describe("validación y permisos", () => {
    it.each([
      ["sin destinatarios", { to: [] }],
      ["correo inválido", { to: ["no-es-correo"] }],
      ["más de 10 destinatarios", { to: Array.from({ length: 11 }, (_, i) => `a${i}@example.com`) }],
      ["asunto vacío", { subject: "  " }],
      ["asunto con salto de línea (inyección de cabeceras)", { subject: "Hola\nBcc: x@example.com" }],
      ["mensaje vacío", { message: "" }],
      ["mensaje enorme", { message: "x".repeat(5001) }],
    ])("rechaza %s", async (_name, extra) => {
      const q = await newQuotation();
      const res = await send(q.id, valid(extra));
      expect(res.status).toBe(400);
      expect(sendMail).not.toHaveBeenCalled();
      expect(await statusOf(q.id)).toBe("BORRADOR");
    });

    it("exige sesión y el permiso MANAGE_QUOTATIONS", async () => {
      const q = await newQuotation();
      expect((await request(app).post(`/api/quotations/${q.id}/send`).send(valid())).status).toBe(401);
      expect((await send(q.id, valid(), tokenOf(finanzas))).status).toBe(403);
      expect(sendMail).not.toHaveBeenCalled();
    });

    it("404 si la cotización no existe", async () => {
      expect((await send("00000000-0000-0000-0000-000000000000", valid())).status).toBe(404);
    });
  });

  describe("cambio de estado manual (compatibilidad)", () => {
    it("pasar a Enviada sin correo (sendEmail:false) no envía nada", async () => {
      const q = await newQuotation();
      const res = await request(app).patch(`/api/quotations/${q.id}/status`).set(auth()).send({ status: "ENVIADA", sendEmail: false });
      expect(res.status).toBe(200);
      expect(sendMail).not.toHaveBeenCalled();
      expect(await statusOf(q.id)).toBe("ENVIADA");
    });

    it("por defecto sigue enviando el correo automático, con las variables de la plantilla rellenas", async () => {
      await useTemplate("Cot {{quotation_number}}", "<p>Hola {{client_name}}</p>");
      const q = await newQuotation();
      const res = await request(app).patch(`/api/quotations/${q.id}/status`).set(auth()).send({ status: "ENVIADA" });
      expect(res.status).toBe(200);
      expect(sendMail).toHaveBeenCalledTimes(1);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.subject).toBe(`Cot ${q.quotationNumber}`);
      expect(mail.html).toBe("<p>Hola Ana</p>"); // antes salía "{{client_name}}" sin rellenar
    });
  });
});
