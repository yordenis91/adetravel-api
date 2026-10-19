// Cotización en línea contra Postgres real: envío con enlace/PDF/CC/CCO/«Responder a», página pública (sin fugas,
// 404 uniforme, solo visitas de personas), aceptación y consultas que avisan sin cambiar el estado, seguimiento para
// el agente, envío programado y recordatorios internos. Correo y PDF simulados. Requiere Postgres migrado.
process.env.RATE_LIMIT_MAX = "100000";
process.env.PUBLIC_READ_RATE_LIMIT_MAX = "100000";
process.env.PUBLIC_WRITE_RATE_LIMIT_MAX = "100000";
process.env.PUBLIC_PDF_RATE_LIMIT_MAX = "100000";
process.env.EMAIL_DELIVERY = "live";
process.env.SMTP_HOST = "smtp.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "u";
process.env.SMTP_PASS = "p";
process.env.SMTP_FROM = "agencia@example.com";
process.env.FRONTEND_URL = "https://app.ejemplo.cl";

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

/* eslint-disable @typescript-eslint/no-var-requires */
const { app } = require("../src/app");
const { env } = require("../src/config/env");
const { prisma } = require("../src/lib/prisma");
const { buildLinkCode, buildLinkUrl } = require("../src/services/quotation-link.service");
const { runScheduledQuotationSendsJob } = require("../src/jobs/scheduledQuotationSends.job");
const { runQuotationRemindersJob } = require("../src/jobs/quotationReminders.job");
/* eslint-enable @typescript-eslint/no-var-requires */

const tag = `ql${process.pid}${Date.now()}`;
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const BOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const DAY = 86_400_000;

describe("cotización en línea (integración con Postgres)", () => {
  type Person = { id: string; email: string; role: string };
  let agent: Person;
  let manager: Person;
  let otherAgent: Person;
  let client: { id: string; email: string };
  const requestIds: string[] = [];

  const tokenOf = (u: Person) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email, role: u.role, tv: 0 }, env.JWT_SECRET)}` });
  const auth = () => tokenOf(agent);
  const send = (id: string, body: object) => request(app).post(`/api/quotations/${id}/send`).set(auth()).send(body);
  const valid = (extra: object = {}) => ({ to: [client.email], subject: "Tu cotización", message: "Hola Ana,\n\nTe envío la propuesta.", ...extra });
  const codeOf = (res: { body: { error?: { code?: string }; code?: string } }) => res.body.error?.code ?? res.body.code;
  const view = (code: string, ua = BROWSER) => request(app).get(`/api/public/quotations/${code}`).set("User-Agent", ua);
  const post = (code: string, path: string, body: object = {}, ua = BROWSER) => request(app).post(`/api/public/quotations/${code}/${path}`).set("User-Agent", ua).send(body);
  const notificationsFor = (u: Person, type?: string) => prisma.notification.findMany({ where: { userId: u.id, ...(type ? { type } : {}) }, orderBy: { createdAt: "asc" } });
  const linkCodeOf = (url: string) => url.split("/c/")[1];

  async function newQuotation(extra: Record<string, unknown> = {}) {
    const r = await prisma.request.create({ data: { requestNumber: `${tag}-R${requestIds.length}`, clientId: client.id, isPackage: true, createdBy: agent.id, destinationCity: "Cancún", destinationCountry: "México" } });
    requestIds.push(r.id);
    const res = await request(app).post("/api/quotations").set(auth()).send({
      requestId: r.id, clientId: client.id, currency: "CLP", taxPercentage: 19, discount: 0, validUntil: "2099-12-31",
      items: [{ service: "Hotel", description: "3 noches", quantity: 1, unitPrice: 100000, total: 0 }], notes: "Incluye desayuno", ...extra,
    });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  /** Cotización ya enviada con enlace; devuelve también el código para abrir la página pública. */
  async function sentQuotation(extra: Record<string, unknown> = {}, sendOptions: object = {}) {
    const q = await newQuotation(extra);
    const res = await send(q.id, valid(sendOptions));
    expect(res.status).toBe(200);
    return { q, code: linkCodeOf(res.body.data.linkUrl), linkUrl: res.body.data.linkUrl as string };
  }

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("Inicial-2026!", 4);
    agent = await prisma.user.create({ data: { email: `${tag}-agente@example.com`, fullName: "Agente Uno", passwordHash, role: "ADMINISTRADOR" } });
    manager = await prisma.user.create({ data: { email: `${tag}-gerente@example.com`, fullName: "Gerente Uno", passwordHash, role: "USUARIO", agencyRole: "GERENTE" } });
    otherAgent = await prisma.user.create({ data: { email: `${tag}-otro@example.com`, fullName: "Agente Dos", passwordHash, role: "USUARIO", agencyRole: "AGENTE_VENTAS" } });
    client = await prisma.client.create({ data: { firstName: "Ana", lastName: `Link ${tag}`, email: `${tag}-ana@example.com`, rut: "11.111.111-1", additionalEmails: [`${tag}-conta@example.com`] } });
  });

  afterAll(async () => {
    const where = { requestId: { in: requestIds } };
    const users = [agent.id, manager.id, otherAgent.id];
    const mine = (await prisma.quotation.findMany({ where, select: { id: true } })).map((q: { id: string }) => q.id);
    await prisma.service.deleteMany({ where });
    await prisma.quotation.deleteMany({ where });
    await prisma.task.deleteMany({ where: { userId: { in: users } } });
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.activityLog.deleteMany({ where: { OR: [{ performedBy: { in: users } }, { entityType: "Quotation", entityId: { in: mine } }] } });
    await prisma.request.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.client.deleteMany({ where: { id: client.id } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({});
    env.EMAIL_DELIVERY = "live";
  });

  describe("envío con enlace, PDF, CC, CCO y «Responder a»", () => {
    it("por defecto adjunta el PDF y pone en el correo el botón con el enlace; responde al agente", async () => {
      const { q, linkUrl } = await sentQuotation();
      expect(linkUrl).toMatch(/^https:\/\/app\.ejemplo\.cl\/c\/[0-9a-f]{32}[A-Za-z0-9_-]{43}$/);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.html).toContain(linkUrl);
      expect(mail.html).toContain("Ver cotización en línea");
      expect(mail.attachments).toHaveLength(1);
      expect(mail.replyTo).toBe(agent.email);
      expect((await prisma.quotation.findUnique({ where: { id: q.id } })).status).toBe("ENVIADA");
    });

    it("solo enlace: sin adjunto; solo PDF: sin enlace; ninguno de los dos: 400", async () => {
      const onlyLink = await newQuotation();
      expect((await send(onlyLink.id, valid({ attachPdf: false }))).status).toBe(200);
      expect(sendMail.mock.calls[0][0].attachments).toBeUndefined();
      expect(sendMail.mock.calls[0][0].html).toContain("/c/");

      const onlyPdf = await newQuotation();
      const res = await send(onlyPdf.id, valid({ includeLink: false }));
      expect(res.status).toBe(200);
      expect(res.body.data.linkUrl).toBeNull();
      expect(sendMail.mock.calls[1][0].html).not.toContain("/c/");
      expect(sendMail.mock.calls[1][0].attachments).toHaveLength(1);
      expect(await prisma.quotationLink.count({ where: { quotationId: onlyPdf.id } })).toBe(0);

      const none = await newQuotation();
      const bad = await send(none.id, valid({ attachPdf: false, includeLink: false }));
      expect(bad.status).toBe(400);
      expect(sendMail).toHaveBeenCalledTimes(2);
    });

    it("manda CC y CCO, sin repetir a quien ya está en Para; CCO no se ve en el asunto ni el cuerpo", async () => {
      const q = await newQuotation();
      const res = await send(q.id, valid({ cc: [`${tag}-conta@example.com`, client.email.toUpperCase()], bcc: [`${tag}-jefe@example.com`] }));
      expect(res.status).toBe(200);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toEqual([client.email]);
      expect(mail.cc).toEqual([`${tag}-conta@example.com`]);
      expect(mail.bcc).toEqual([`${tag}-jefe@example.com`]);
      expect(res.body.data.recipients).toBe(3);
      expect(mail.html).not.toContain(`${tag}-jefe@example.com`);
    });

    it("en modo redirect (demo) todo va a la casilla de pruebas y no se manda CC/CCO a nadie real", async () => {
      env.EMAIL_DELIVERY = "redirect";
      env.EMAIL_REDIRECT_TO = "pruebas@example.com";
      const q = await newQuotation();
      const res = await send(q.id, valid({ cc: [`${tag}-conta@example.com`], bcc: [`${tag}-jefe@example.com`] }));
      expect(res.status).toBe(200);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.to).toBe("pruebas@example.com");
      expect(mail.cc).toBeUndefined();
      expect(mail.bcc).toBeUndefined();
      env.EMAIL_REDIRECT_TO = undefined;
    });

    it("el borrador ofrece el texto según lo que se envíe y a quién responderán", async () => {
      const q = await newQuotation();
      const res = await request(app).get(`/api/quotations/${q.id}/email-draft`).set(auth());
      expect(res.body.data.replyTo).toBe(agent.email);
      expect(res.body.data.messages.both).toContain("botón de abajo");
      expect(res.body.data.messages.both).toContain("PDF");
      expect(res.body.data.messages.link).toContain("descargar el PDF desde el botón");
      expect(res.body.data.messages.pdf).toContain("PDF adjunto");
      expect(res.body.data.messages.pdf).not.toContain("botón");
    });

    it("reenviar reutiliza el mismo enlace (el correo anterior del cliente sigue funcionando)", async () => {
      const { q, linkUrl } = await sentQuotation();
      const again = await send(q.id, valid());
      expect(again.body.data.linkUrl).toBe(linkUrl);
      expect(await prisma.quotationLink.count({ where: { quotationId: q.id } })).toBe(1);
    });

    it("si el correo no sale no queda enlace visible: la cotización sigue en Borrador y el enlace da 404", async () => {
      sendMail.mockRejectedValueOnce(new Error("smtp caído"));
      const q = await newQuotation();
      const res = await send(q.id, valid());
      expect(res.status).toBe(502);
      const link = await prisma.quotationLink.findFirst({ where: { quotationId: q.id } });
      expect((await view(buildLinkCode(link.id))).status).toBe(404);
    });
  });

  describe("página pública", () => {
    it("muestra solo lo del cliente: sin RUT, correos, ids ni datos internos; con cabeceras privadas", async () => {
      const { code } = await sentQuotation();
      const res = await view(code);
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.headers["x-robots-tag"]).toContain("noindex");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      const d = res.body.data;
      expect(d).toMatchObject({ state: "open", clientFirstName: "Ana", currency: "CLP", total: 119000, destination: "Cancún, México", canAccept: true, acceptanceRequested: false, agentName: "Agente Uno" });
      expect(d.items).toEqual([{ service: "Hotel", description: "3 noches", quantity: 1, unitPrice: 100000, total: 100000 }]);
      const raw = JSON.stringify(res.body);
      for (const secret of [client.email, "11.111.111-1", `Link ${tag}`, client.id, agent.id, agent.email, "requestId", "createdBy", "clientId"]) {
        expect(raw).not.toContain(secret);
      }
    });

    it("un código falso, mal formado, manipulado, revocado, vencido o de una cotización en Borrador responde igual (404)", async () => {
      const { q, code } = await sentQuotation();
      const forged = `${code.slice(0, 32)}${"A".repeat(43)}`;
      const noSuchLink = buildLinkCode("00000000-0000-4000-8000-000000000000");
      const bodies = new Set<string>();
      for (const bad of ["x", "no-es-un-codigo", forged, noSuchLink, `${code}0`, code.slice(0, -1)]) {
        const res = await view(bad);
        expect(res.status).toBe(404);
        bodies.add(JSON.stringify(res.body));
      }
      const link = await prisma.quotationLink.findFirst({ where: { quotationId: q.id } });
      await prisma.quotationLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
      const revoked = await view(code);
      expect(revoked.status).toBe(404);
      bodies.add(JSON.stringify(revoked.body));
      await prisma.quotationLink.update({ where: { id: link.id }, data: { revokedAt: null, expiresAt: new Date(Date.now() - 1000) } });
      const expired = await view(code);
      expect(expired.status).toBe(404);
      bodies.add(JSON.stringify(expired.body));
      await prisma.quotationLink.update({ where: { id: link.id }, data: { expiresAt: new Date(Date.now() + DAY) } });
      await prisma.quotation.update({ where: { id: q.id }, data: { status: "BORRADOR" } });
      const draft = await view(code);
      expect(draft.status).toBe(404);
      bodies.add(JSON.stringify(draft.body));
      expect(bodies.size).toBe(1);
      expect(codeOf({ body: JSON.parse([...bodies][0]) })).toBe("LINK_NOT_FOUND");
    });

    it("una cotización vencida enseña «vencida» sin precios ni detalle, y no se puede aceptar", async () => {
      const { q, code } = await sentQuotation();
      await prisma.quotation.update({ where: { id: q.id }, data: { validUntil: "2020-01-01" } });
      const res = await view(code);
      expect(res.body.data.state).toBe("expired");
      expect(res.body.data.total).toBeUndefined();
      expect(res.body.data.items).toBeUndefined();
      expect(res.body.data.agency.name).toBeTruthy();
      expect((await post(code, "accept")).status).toBe(409);
      expect((await request(app).get(`/api/public/quotations/${code}/pdf`)).status).toBe(404);
    });

    it("el PDF se puede descargar y queda registrado; vencida o rechazada, no", async () => {
      const { q, code } = await sentQuotation();
      const res = await request(app).get(`/api/public/quotations/${code}/pdf`).set("User-Agent", BROWSER);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain(`${q.quotationNumber}.pdf`);
      const link = await prisma.quotationLink.findFirst({ where: { quotationId: q.id } });
      expect(await prisma.quotationLinkEvent.count({ where: { linkId: link.id, type: "DOWNLOAD" } })).toBe(1);
      await prisma.quotation.update({ where: { id: q.id }, data: { status: "RECHAZADA" } });
      expect((await request(app).get(`/api/public/quotations/${code}/pdf`)).status).toBe(404);
      expect((await view(code)).body.data.state).toBe("closed");
    });
  });

  describe("seguimiento de aperturas", () => {
    it("la primera apertura de una persona se cuenta, avisa al agente (no al gerente) y registra el dispositivo", async () => {
      const { q, code } = await sentQuotation();
      const before = (await notificationsFor(manager)).length;
      await view(code, PHONE);
      const link = await prisma.quotationLink.findFirst({ where: { quotationId: q.id } });
      expect(link.viewCount).toBe(1);
      expect(link.firstViewedAt).not.toBeNull();
      const events = await prisma.quotationLinkEvent.findMany({ where: { linkId: link.id } });
      expect(events.map((e: { type: string; device: string }) => [e.type, e.device])).toEqual([["VIEW", "mobile"]]);
      const notes = (await notificationsFor(agent, "QUOTATION_VIEWED")).filter((n: { relatedEntityId: string }) => n.relatedEntityId === q.id);
      expect(notes).toHaveLength(1);
      expect(notes[0].message).toContain("Ana");
      expect((await notificationsFor(manager)).length).toBe(before);
    });

    it("bots, antivirus, previsualizadores y el personal con sesión NO cuentan como apertura", async () => {
      const { q, code } = await sentQuotation();
      await view(code, BOT);
      await view(code, "WhatsApp/2.23.20 A");
      await view(code, "");
      await request(app).get(`/api/public/quotations/${code}`).set("User-Agent", BROWSER).set(auth());
      const link = await prisma.quotationLink.findFirst({ where: { quotationId: q.id } });
      expect(link.viewCount).toBe(0);
      expect(link.firstViewedAt).toBeNull();
      expect(await prisma.quotationLinkEvent.count({ where: { linkId: link.id } })).toBe(0);
    });

    it("refrescar no infla las visitas; volver otro día sí cuenta y vuelve a avisar, pero no antes de 24 h", async () => {
      const { q, code } = await sentQuotation();
      await view(code);
      await view(code);
      await view(code);
      let link = await prisma.quotationLink.findFirst({ where: { quotationId: q.id } });
      expect(link.viewCount).toBe(1);

      // 2 h después: visita nueva, pero no se vuelve a avisar (sería ruido).
      await prisma.quotationLink.update({ where: { id: link.id }, data: { lastViewedAt: new Date(Date.now() - 2 * 3600_000) } });
      await view(code);
      link = await prisma.quotationLink.findFirst({ where: { quotationId: q.id } });
      expect(link.viewCount).toBe(2);
      const viewed = () => notificationsFor(agent, "QUOTATION_VIEWED").then((all: { relatedEntityId: string }[]) => all.filter((n) => n.relatedEntityId === q.id));
      expect(await viewed()).toHaveLength(1);

      // 2 días después: visita nueva y aviso de «volvió a abrir».
      await prisma.quotationLink.update({ where: { id: link.id }, data: { lastViewedAt: new Date(Date.now() - 2 * DAY) } });
      await view(code);
      expect(await viewed()).toHaveLength(2);
    });

    it("dos aperturas simultáneas generan un solo «primera vez»", async () => {
      const { q, code } = await sentQuotation();
      await Promise.all([view(code), view(code), view(code)]);
      const notes = (await notificationsFor(agent, "QUOTATION_VIEWED")).filter((n: { relatedEntityId: string }) => n.relatedEntityId === q.id);
      expect(notes).toHaveLength(1);
      expect((await prisma.quotationLink.findFirst({ where: { quotationId: q.id } })).viewCount).toBe(1);
    });

    it("el aviso va a quien envió la cotización, aunque la haya creado otra persona", async () => {
      const q = await newQuotation();
      const res = await request(app).post(`/api/quotations/${q.id}/send`).set(tokenOf(otherAgent)).send(valid());
      // otherAgent (AGENTE_VENTAS) sí puede enviar cotizaciones
      expect(res.status).toBe(200);
      await view(linkCodeOf(res.body.data.linkUrl));
      const mine = (await notificationsFor(otherAgent, "QUOTATION_VIEWED")).filter((n: { relatedEntityId: string }) => n.relatedEntityId === q.id);
      expect(mine).toHaveLength(1);
      expect(sendMail.mock.calls[0][0].replyTo).toBe(otherAgent.email);
    });
  });

  describe("aceptar, consultar y renovar desde el enlace", () => {
    it("«Aceptar» NO cambia el estado: crea tarea y avisa al agente y al gerente (también por correo al agente); es idempotente", async () => {
      const { q, code } = await sentQuotation();
      sendMail.mockClear();
      const res = await post(code, "accept", { contactName: "Ana P." });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ requested: true, alreadyRequested: false });
      expect((await prisma.quotation.findUnique({ where: { id: q.id } })).status).toBe("ENVIADA");

      const tasks = await prisma.task.findMany({ where: { relatedEntityId: q.id, userId: agent.id } });
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({ priority: "ALTA", relatedEntityType: "COTIZACION", relatedEntityLabel: q.quotationNumber });
      for (const person of [agent, manager]) {
        const n = (await notificationsFor(person, "QUOTATION_ACCEPT_REQUESTED")).filter((x: { relatedEntityId: string }) => x.relatedEntityId === q.id);
        expect(n).toHaveLength(1);
        expect(n[0].message).toContain("Ana P.");
      }
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0].to).toEqual([agent.email]);

      const again = await post(code, "accept");
      expect(again.body.data).toEqual({ requested: true, alreadyRequested: true });
      expect(await prisma.task.count({ where: { relatedEntityId: q.id, userId: agent.id } })).toBe(1);
      expect((await view(code)).body.data).toMatchObject({ canAccept: false, acceptanceRequested: true });
    });

    it("el agente confirma con el cambio de estado de siempre y la página pasa a «aceptada» (sin botón)", async () => {
      const { q, code } = await sentQuotation();
      await post(code, "accept");
      const ok = await request(app).patch(`/api/quotations/${q.id}/status`).set(auth()).send({ status: "ACEPTADA", sendEmail: false });
      expect(ok.status).toBe(200);
      const res = await view(code);
      expect(res.body.data.state).toBe("accepted");
      expect(res.body.data.canAccept).toBe(false);
      expect(res.body.data.total).toBe(119000);
      expect((await post(code, "accept")).body.data.alreadyRequested).toBe(true);
    });

    it("una consulta crea tarea y aviso al agente; es obligatorio escribirla; el gerente no recibe consultas rutinarias", async () => {
      const { q, code } = await sentQuotation();
      expect((await post(code, "question", {})).status).toBe(400);
      expect((await post(code, "question", { message: "   " })).status).toBe(400);
      const res = await post(code, "question", { message: "¿Incluye traslados?", contactName: "Ana" });
      expect(res.status).toBe(200);
      const task = await prisma.task.findFirst({ where: { relatedEntityId: q.id, userId: agent.id } });
      expect(task.description).toContain("¿Incluye traslados?");
      const asked = (p: Person) => notificationsFor(p, "QUOTATION_QUESTION").then((all: { relatedEntityId: string }[]) => all.filter((n) => n.relatedEntityId === q.id));
      expect(await asked(agent)).toHaveLength(1);
      expect(await asked(manager)).toHaveLength(0);
      expect((await prisma.quotation.findUnique({ where: { id: q.id } })).status).toBe("ENVIADA");
    });

    it("el texto del cliente se guarda como texto y los avisos por correo lo escapan; no sirve para inyectar HTML", async () => {
      const { code } = await sentQuotation();
      sendMail.mockClear();
      await post(code, "question", { message: "<script>alert(1)</script> hola" });
      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("máximo 5 mensajes por día y enlace", async () => {
      const { code } = await sentQuotation();
      for (let i = 0; i < 5; i++) expect((await post(code, "question", { message: `consulta ${i}` })).status).toBe(200);
      const res = await post(code, "question", { message: "una más" });
      expect(res.status).toBe(429);
      expect(codeOf(res)).toBe("TOO_MANY_MESSAGES");
    });

    it("pedir renovar una cotización vencida avisa al agente y también al gerente (venta recuperable); si sigue vigente, no aplica", async () => {
      const { q, code } = await sentQuotation();
      expect((await post(code, "renew", {})).status).toBe(409);
      await prisma.quotation.update({ where: { id: q.id }, data: { validUntil: "2020-01-01" } });
      const res = await post(code, "renew", { message: "Aún me interesa" });
      expect(res.status).toBe(200);
      for (const person of [agent, manager]) {
        const n = (await notificationsFor(person, "QUOTATION_RENEW_REQUESTED")).filter((x: { relatedEntityId: string }) => x.relatedEntityId === q.id);
        expect(n).toHaveLength(1);
      }
      expect((await prisma.task.findFirst({ where: { relatedEntityId: q.id, userId: agent.id } })).title).toContain("Actualizar cotización vencida");
    });
  });

  describe("vista del agente", () => {
    it("la lista y el detalle traen el resumen de seguimiento; se puede filtrar «sin abrir», «abiertas» y «piden aceptar»", async () => {
      const unopened = await sentQuotation();
      const opened = await sentQuotation();
      const wants = await sentQuotation();
      await view(opened.code);
      await view(wants.code);
      await post(wants.code, "accept");

      const detail = await request(app).get(`/api/quotations/${opened.q.id}`).set(auth());
      expect(detail.body.data.tracking).toMatchObject({ hasLink: true, viewCount: 1 });
      expect(detail.body.data.tracking.firstViewedAt).toBeTruthy();
      expect(detail.body.data.links).toBeUndefined();

      const ids = async (tracking: string) => {
        const res = await request(app).get(`/api/quotations?tracking=${tracking}&limit=100&clientId=${client.id}`).set(auth());
        expect(res.status).toBe(200);
        return res.body.data.map((x: { id: string }) => x.id);
      };
      const un = await ids("unopened");
      expect(un).toContain(unopened.q.id);
      expect(un).not.toContain(opened.q.id);
      expect(await ids("viewed")).toEqual(expect.arrayContaining([opened.q.id, wants.q.id]));
      const acc = await ids("acceptance");
      expect(acc).toContain(wants.q.id);
      expect(acc).not.toContain(opened.q.id);
      expect((await request(app).get("/api/quotations?tracking=raro").set(auth())).status).toBe(400);
    });

    it("GET /link entrega la URL, las cifras y la línea de tiempo; sin enlace devuelve null", async () => {
      const q = await newQuotation();
      expect((await request(app).get(`/api/quotations/${q.id}/link`).set(auth())).body.data.link).toBeNull();
      const { q: sent, code, linkUrl } = await sentQuotation();
      await view(code, PHONE);
      await post(code, "question", { message: "Hola" });
      const res = await request(app).get(`/api/quotations/${sent.id}/link`).set(auth());
      expect(res.body.data.link).toMatchObject({ url: linkUrl, viewCount: 1 });
      expect(res.body.data.link.events.map((e: { type: string }) => e.type).sort()).toEqual(["QUESTION", "VIEW"]);
      expect(JSON.stringify(res.body)).not.toMatch(/"ip"/);
    });

    it("copiar el enlace sin enviar correo (p. ej. WhatsApp): solo con la cotización Enviada; es el mismo enlace cada vez", async () => {
      const q = await newQuotation();
      expect((await request(app).post(`/api/quotations/${q.id}/link`).set(auth())).status).toBe(409);
      await request(app).patch(`/api/quotations/${q.id}/status`).set(auth()).send({ status: "ENVIADA", sendEmail: false });
      const a = await request(app).post(`/api/quotations/${q.id}/link`).set(auth());
      const b = await request(app).post(`/api/quotations/${q.id}/link`).set(auth());
      expect(a.status).toBe(200);
      expect(a.body.data.link.url).toBe(b.body.data.link.url);
      expect((await view(linkCodeOf(a.body.data.link.url))).status).toBe(200);
    });

    it("regenerar anula el enlace anterior; revocar lo deja sin enlace; ambos quedan en la bitácora", async () => {
      const { q, code } = await sentQuotation();
      const regen = await request(app).post(`/api/quotations/${q.id}/link/regenerate`).set(auth());
      expect(regen.status).toBe(200);
      const fresh = linkCodeOf(regen.body.data.link.url);
      expect(fresh).not.toBe(code);
      expect((await view(code)).status).toBe(404);
      expect((await view(fresh)).status).toBe(200);
      const revoke = await request(app).delete(`/api/quotations/${q.id}/link`).set(auth());
      expect(revoke.body.data.revoked).toBe(1);
      expect((await view(fresh)).status).toBe(404);
      expect((await request(app).get(`/api/quotations/${q.id}/link`).set(auth())).body.data.link).toBeNull();
      const logs = await prisma.activityLog.findMany({ where: { entityId: q.id, performedBy: agent.id } });
      const descriptions = logs.map((l: { description: string }) => l.description).join("|");
      expect(descriptions).toContain("Enlace en línea regenerado");
      expect(descriptions).toContain("Enlace en línea revocado");
    });

    it("sin permiso de gestionar cotizaciones no se puede crear, regenerar ni revocar el enlace (403)", async () => {
      const finance = await prisma.user.create({ data: { email: `${tag}-fin@example.com`, fullName: "Fin", passwordHash: "x", role: "USUARIO", agencyRole: "FINANZAS" } });
      try {
        const { q } = await sentQuotation();
        const h = tokenOf(finance);
        expect((await request(app).post(`/api/quotations/${q.id}/link`).set(h)).status).toBe(403);
        expect((await request(app).post(`/api/quotations/${q.id}/link/regenerate`).set(h)).status).toBe(403);
        expect((await request(app).delete(`/api/quotations/${q.id}/link`).set(h)).status).toBe(403);
        expect((await request(app).get(`/api/quotations/${q.id}/link`).set(h)).status).toBe(200);
      } finally {
        await prisma.user.delete({ where: { id: finance.id } });
      }
    });

    it("el enlace desaparece con la cotización al eliminarla (borrador)", async () => {
      const q = await newQuotation();
      await prisma.quotationLink.create({ data: { quotationId: q.id, expiresAt: new Date(Date.now() + DAY) } });
      expect((await request(app).delete(`/api/quotations/${q.id}`).set(auth())).status).toBe(200);
      expect(await prisma.quotationLink.count({ where: { quotationId: q.id } })).toBe(0);
    });
  });

  describe("creación simultánea de cotizaciones", () => {
    it("varias altas a la vez no fallan por un correlativo repetido: se reintenta y cada una queda con su número", async () => {
      const requests = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          prisma.request.create({ data: { requestNumber: `${tag}-C${i}`, clientId: client.id, isPackage: true, createdBy: agent.id } })
        )
      );
      requestIds.push(...requests.map((r: { id: string }) => r.id));
      const results = await Promise.all(
        requests.map((r: { id: string }) =>
          request(app).post("/api/quotations").set(auth()).send({
            requestId: r.id, clientId: client.id, currency: "CLP", taxPercentage: 19, discount: 0, validUntil: "2099-12-31",
            items: [{ service: "Hotel", description: "", quantity: 1, unitPrice: 1000, total: 0 }],
          })
        )
      );
      expect(results.map((r: { status: number }) => r.status)).toEqual(Array(8).fill(201));
      const numbers = results.map((r: { body: { data: { quotationNumber: string } } }) => r.body.data.quotationNumber);
      expect(new Set(numbers).size).toBe(8);
    });
  });

  describe("vencimiento del enlace", () => {
    it("vence 30 días después de la vigencia de la cotización", async () => {
      const { q } = await sentQuotation({ validUntil: "2030-06-15" });
      const link = await prisma.quotationLink.findFirst({ where: { quotationId: q.id } });
      const days = Math.round((link.expiresAt.getTime() - new Date("2030-06-15T00:00:00Z").getTime()) / DAY);
      expect(days).toBe(31); // fin del día de la vigencia + 30 días de gracia
    });

    it("buildLinkUrl entrega el mismo enlace que se envió", async () => {
      const { q, linkUrl } = await sentQuotation();
      const link = await prisma.quotationLink.findFirst({ where: { quotationId: q.id } });
      expect(buildLinkUrl(link.id)).toBe(linkUrl);
    });
  });

  describe("envío programado", () => {
    const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

    it("no envía ahora: lo deja pendiente; llegada la hora lo envía con enlace y PDF y pasa a Enviada", async () => {
      const q = await newQuotation();
      const res = await send(q.id, valid({ scheduledAt: inMinutes(30), cc: [`${tag}-conta@example.com`] }));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ sent: false, scheduled: true, statusChanged: false });
      expect(sendMail).not.toHaveBeenCalled();
      expect((await prisma.quotation.findUnique({ where: { id: q.id } })).status).toBe("BORRADOR");

      const pending = await request(app).get(`/api/quotations/${q.id}/scheduled`).set(auth());
      expect(pending.body.data).toHaveLength(1);
      expect(pending.body.data[0].status).toBe("PENDIENTE");

      // Todavía no es la hora.
      expect(await runScheduledQuotationSendsJob(new Date())).toMatchObject({ sent: 0 });
      // Ya es la hora.
      const done = await runScheduledQuotationSendsJob(new Date(Date.now() + 31 * 60_000));
      expect(done.sent).toBeGreaterThanOrEqual(1);
      expect(sendMail).toHaveBeenCalledTimes(1);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.cc).toEqual([`${tag}-conta@example.com`]);
      expect(mail.html).toContain("/c/");
      expect(mail.attachments).toHaveLength(1);
      expect(mail.replyTo).toBe(agent.email);
      expect((await prisma.quotation.findUnique({ where: { id: q.id } })).status).toBe("ENVIADA");
      // No se envía dos veces.
      await runScheduledQuotationSendsJob(new Date(Date.now() + 40 * 60_000));
      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it("se puede cancelar mientras esté pendiente; luego no sale", async () => {
      const q = await newQuotation();
      await send(q.id, valid({ scheduledAt: inMinutes(10) }));
      const [job] = (await request(app).get(`/api/quotations/${q.id}/scheduled`).set(auth())).body.data;
      expect((await request(app).delete(`/api/quotations/${q.id}/scheduled/${job.id}`).set(auth())).status).toBe(200);
      expect((await request(app).delete(`/api/quotations/${q.id}/scheduled/${job.id}`).set(auth())).status).toBe(409);
      await runScheduledQuotationSendsJob(new Date(Date.now() + 60 * 60_000));
      expect(sendMail).not.toHaveBeenCalled();
    });

    it("rechaza fechas pasadas o a más de 90 días", async () => {
      const q = await newQuotation();
      expect((await send(q.id, valid({ scheduledAt: new Date(Date.now() - 3600_000).toISOString() }))).status).toBe(400);
      expect((await send(q.id, valid({ scheduledAt: new Date(Date.now() + 100 * DAY).toISOString() }))).status).toBe(400);
      expect((await send(q.id, valid({ scheduledAt: "mañana" }))).status).toBe(400);
    });

    it("si al llegar la hora ya no se puede enviar (p. ej. la aceptaron), queda fallido y avisa a quien lo programó", async () => {
      const q = await newQuotation();
      await send(q.id, valid({ scheduledAt: inMinutes(5) }));
      await prisma.quotation.update({ where: { id: q.id }, data: { status: "ACEPTADA" } });
      const result = await runScheduledQuotationSendsJob(new Date(Date.now() + 10 * 60_000));
      expect(result.failed).toBeGreaterThanOrEqual(1);
      expect(sendMail).not.toHaveBeenCalled();
      const [job] = (await request(app).get(`/api/quotations/${q.id}/scheduled`).set(auth())).body.data;
      expect(job.status).toBe("FALLIDO");
      const notes = (await notificationsFor(agent, "QUOTATION_SCHEDULED_FAILED")).filter((n: { relatedEntityId: string }) => n.relatedEntityId === q.id);
      expect(notes).toHaveLength(1);
    });

    it("un fallo pasajero del correo se reintenta y a la tercera se da por fallido", async () => {
      const q = await newQuotation();
      await send(q.id, valid({ scheduledAt: inMinutes(5) }));
      sendMail.mockRejectedValue(new Error("smtp caído"));
      let when = Date.now() + 10 * 60_000;
      const first = await runScheduledQuotationSendsJob(new Date(when));
      expect(first.retried).toBeGreaterThanOrEqual(1);
      when += 10 * 60_000;
      await runScheduledQuotationSendsJob(new Date(when));
      when += 10 * 60_000;
      const last = await runScheduledQuotationSendsJob(new Date(when));
      expect(last.failed).toBeGreaterThanOrEqual(1);
      expect((await prisma.quotation.findUnique({ where: { id: q.id } })).status).toBe("BORRADOR");
    });

    it("un envío que quedó «en proceso» por una caída del servidor se recupera", async () => {
      const q = await newQuotation();
      await send(q.id, valid({ scheduledAt: inMinutes(5) }));
      const [job] = (await request(app).get(`/api/quotations/${q.id}/scheduled`).set(auth())).body.data;
      await prisma.scheduledQuotationSend.update({ where: { id: job.id }, data: { status: "PROCESANDO", claimedAt: new Date(Date.now() - 3600_000) } });
      const result = await runScheduledQuotationSendsJob(new Date(Date.now() + 10 * 60_000));
      expect(result.sent).toBeGreaterThanOrEqual(1);
      expect(sendMail).toHaveBeenCalledTimes(1);
    });
  });

  describe("recordatorios internos al agente", () => {
    it("«sin abrir en 3 días» avisa una sola vez, solo si nadie la abrió; no escribe al cliente", async () => {
      const unopened = await sentQuotation();
      const opened = await sentQuotation();
      await view(opened.code);
      await prisma.quotationLink.updateMany({ where: { quotationId: { in: [unopened.q.id, opened.q.id] } }, data: { createdAt: new Date(Date.now() - 4 * DAY) } });
      sendMail.mockClear();
      const first = await runQuotationRemindersJob();
      expect(first.unopened).toBeGreaterThanOrEqual(1);
      const mine = async (id: string) => (await notificationsFor(agent, "QUOTATION_UNOPENED")).filter((n: { relatedEntityId: string }) => n.relatedEntityId === id);
      expect(await mine(unopened.q.id)).toHaveLength(1);
      expect(await mine(opened.q.id)).toHaveLength(0);
      await runQuotationRemindersJob();
      expect(await mine(unopened.q.id)).toHaveLength(1);
      expect(sendMail).not.toHaveBeenCalled();
    });

    it("«por vencer» avisa una vez si vence en 2 días y no la han aceptado; si el cliente ya pidió aceptar, no insiste", async () => {
      const soon = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
      const expiring = await sentQuotation({ validUntil: soon(1) });
      const asked = await sentQuotation({ validUntil: soon(1) });
      const far = await sentQuotation({ validUntil: soon(20) });
      await post(asked.code, "accept");
      await runQuotationRemindersJob();
      await runQuotationRemindersJob();
      const mine = async (id: string) => (await notificationsFor(agent, "QUOTATION_EXPIRING")).filter((n: { relatedEntityId: string }) => n.relatedEntityId === id);
      expect(await mine(expiring.q.id)).toHaveLength(1);
      expect(await mine(asked.q.id)).toHaveLength(0);
      expect(await mine(far.q.id)).toHaveLength(0);
    });
  });
});
