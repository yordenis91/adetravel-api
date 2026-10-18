const sendMail = jest.fn().mockResolvedValue({});
const createTransport = jest.fn(() => ({ sendMail }));
jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport }, createTransport }));
jest.mock("../../../src/lib/prisma", () => ({
  prisma: {
    systemConfig: { findFirst: jest.fn().mockResolvedValue({ smtpHost: "h", smtpPort: 587, smtpUser: "u", smtpPassword: "p", smtpFromEmail: "a@b.cl" }) },
    emailTemplate: { findFirst: jest.fn() },
  },
}));
jest.mock("../../../src/config/env", () => ({ env: { EMAIL_DELIVERY: "live", NODE_ENV: "test" } }));
jest.mock("../../../src/lib/pii-encryption", () => ({ decryptPII: (v: string) => v }));

import { sendEmail, sendTemplateEmail } from "../../../src/services/email.service";
import { prisma } from "../../../src/lib/prisma";

const template = prisma.emailTemplate.findFirst as jest.Mock;
beforeEach(() => { sendMail.mockClear(); template.mockReset(); });

describe("sendTemplateEmail: variables", () => {
  it("rellena las variables en asunto y cuerpo", async () => {
    template.mockResolvedValue({ subject: "Cotización {{quotation_number}}", bodyHtml: "<p>Hola {{client_name}}</p>" });
    await sendTemplateEmail({ type: "QUOTATION_SENT", to: "a@x.cl", variables: { quotation_number: "C-1", client_name: "Ana" }, fallbackSubject: "f", fallbackHtml: "f" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: "Cotización C-1", html: "<p>Hola Ana</p>" }));
  });
  it("un valor con '$&' o '$1' (un monto) no se interpreta como patrón de reemplazo", async () => {
    template.mockResolvedValue({ subject: "{{total}}", bodyHtml: "{{total}}" });
    await sendTemplateEmail({ type: "X", to: "a@x.cl", variables: { total: "$&$1$2.450.000" }, fallbackSubject: "f", fallbackHtml: "f" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: "$&$1$2.450.000" }));
    expect(sendMail.mock.calls[0][0].html).toBe("$&amp;$1$2.450.000");
  });
  it("en el cuerpo HTML los valores se escapan; en el asunto no", async () => {
    template.mockResolvedValue({ subject: "{{client_name}}", bodyHtml: "<p>{{client_name}}</p>" });
    await sendTemplateEmail({ type: "X", to: "a@x.cl", variables: { client_name: "<b>Ana</b>" }, fallbackSubject: "f", fallbackHtml: "f" });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).toBe("<p>&lt;b&gt;Ana&lt;/b&gt;</p>");
    expect(mail.subject).toBe("<b>Ana</b>");
  });
  it("sin plantilla usa el texto de respaldo", async () => {
    template.mockResolvedValue(null);
    await sendTemplateEmail({ type: "X", to: "a@x.cl", variables: { n: "1" }, fallbackSubject: "Asunto {{n}}", fallbackHtml: "<p>Cuerpo {{n}}</p>" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: "Asunto 1", html: "<p>Cuerpo 1</p>" }));
  });
});

describe("sendEmail: resultado y destinatarios", () => {
  it("devuelve sent:true y envía a todos los destinatarios", async () => {
    const result = await sendEmail({ to: ["a@x.cl", "b@x.cl"], subject: "s", html: "h" });
    expect(result).toEqual({ sent: true });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: ["a@x.cl", "b@x.cl"] }));
  });
  it("un solo destinatario como texto sigue funcionando", async () => {
    await sendEmail({ to: "a@x.cl", subject: "s", html: "h" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: ["a@x.cl"] }));
  });
});
