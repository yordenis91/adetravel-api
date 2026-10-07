const findFirst = jest.fn();
const sendMail = jest.fn().mockResolvedValue({});
const createTransport = jest.fn(() => ({ sendMail }));
jest.mock("../../../src/lib/prisma", () => ({ prisma: { systemConfig: { findFirst } } }));
jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport }, createTransport }));

import { env } from "../../../src/config/env";
import { maskEmail, resolveDelivery, sendEmail } from "../../../src/services/email.service";

const SMTP = { smtpHost: "smtp.example.com", smtpPort: 587, smtpUser: "u", smtpPassword: "p", smtpFromEmail: "a@example.com" };

describe("salvaguarda de envío de correo (EMAIL_DELIVERY)", () => {
  const original = { mode: env.EMAIL_DELIVERY, to: env.EMAIL_REDIRECT_TO };
  beforeEach(() => {
    jest.clearAllMocks();
    findFirst.mockResolvedValue(SMTP);
  });
  afterEach(() => {
    (env as any).EMAIL_DELIVERY = original.mode;
    (env as any).EMAIL_REDIRECT_TO = original.to;
  });

  it("resolveDelivery: live envía al destinatario real", () => {
    expect(resolveDelivery("cliente@gmail.com", "Hola", "live")).toEqual({ send: true, to: "cliente@gmail.com", subject: "Hola" });
  });

  it("resolveDelivery: redirect envía al buzón de pruebas y deja el original en el asunto", () => {
    const r = resolveDelivery("cliente@gmail.com", "Hola", "redirect", "pruebas@agencia.cl");
    expect(r).toMatchObject({ send: true, to: "pruebas@agencia.cl" });
    expect((r as any).subject).toContain("cliente@gmail.com");
    expect((r as any).subject).toContain("Hola");
  });

  it("resolveDelivery: off y redirect sin buzón no envían", () => {
    expect(resolveDelivery("c@gmail.com", "s", "off")).toEqual({ send: false });
    expect(resolveDelivery("c@gmail.com", "s", "redirect", undefined)).toEqual({ send: false });
  });

  it("sendEmail en modo redirect nunca escribe al cliente real", async () => {
    (env as any).EMAIL_DELIVERY = "redirect";
    (env as any).EMAIL_REDIRECT_TO = "pruebas@agencia.cl";
    await sendEmail({ to: "cliente@gmail.com", subject: "Cotización", html: "<p>x</p>" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe("pruebas@agencia.cl");
  });

  it("sendEmail en modo off no abre conexión SMTP", async () => {
    (env as any).EMAIL_DELIVERY = "off";
    await sendEmail({ to: "cliente@gmail.com", subject: "s", html: "h" });
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("maskEmail no deja la dirección completa en los logs", () => {
    expect(maskEmail("ana.perez@gmail.com")).toBe("a***@gmail.com");
    expect(maskEmail("sin-arroba")).toBe("***");
  });
});
