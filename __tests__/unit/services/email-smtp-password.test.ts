import { encryptPII } from "../../../src/lib/pii-encryption";

const findFirst = jest.fn();
const sendMail = jest.fn().mockResolvedValue({});
const createTransport = jest.fn(() => ({ sendMail }));
jest.mock("../../../src/lib/prisma", () => ({ prisma: { systemConfig: { findFirst } } }));
jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport }, createTransport }));

import { sendEmail } from "../../../src/services/email.service";

const base = { smtpHost: "smtp.example.com", smtpPort: 587, smtpUser: "u", smtpFromEmail: "a@example.com" };

describe("email.service con la contraseña del SMTP cifrada", () => {
  beforeEach(() => jest.clearAllMocks());

  it("descifra la contraseña guardada antes de autenticarse", async () => {
    findFirst.mockResolvedValue({ ...base, smtpPassword: encryptPII("Clave-SMTP-9") });
    await sendEmail({ to: "x@example.com", subject: "s", html: "h" });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: { user: "u", pass: "Clave-SMTP-9" } }));
  });

  it("acepta una contraseña antigua aún en texto plano", async () => {
    findFirst.mockResolvedValue({ ...base, smtpPassword: "plana-antigua" });
    await sendEmail({ to: "x@example.com", subject: "s", html: "h" });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: { user: "u", pass: "plana-antigua" } }));
  });
});
