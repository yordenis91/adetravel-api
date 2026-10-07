// La contraseña del SMTP nunca sale de la API y se guarda cifrada. Requiere Postgres migrado.
jest.mock("../src/services/pdf.service", () => ({}));

import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { decryptPII, isEncryptedPII } from "../src/lib/pii-encryption";

const tag = `smtp-${Date.now()}`;

describe("contraseña del SMTP en la configuración (integración con Postgres)", () => {
  let admin: any;
  let token: string;
  let original: any;

  beforeAll(async () => {
    admin = await prisma.user.create({
      data: { email: `${tag}@example.com`, fullName: "Admin SMTP", passwordHash: "x", role: "ADMINISTRADOR" },
    });
    token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, env.JWT_SECRET);
    original = await prisma.systemConfig.findFirst();
  });

  afterAll(async () => {
    const current = await prisma.systemConfig.findFirst();
    if (current && !original) await prisma.systemConfig.delete({ where: { id: current.id } });
    if (current && original) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...restore } = original;
      await prisma.systemConfig.update({ where: { id: current.id }, data: restore });
    }
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  const put = (body: object) =>
    request(app).put("/api/system-config").set("Authorization", `Bearer ${token}`).send(body);
  const get = () => request(app).get("/api/system-config").set("Authorization", `Bearer ${token}`);
  const stored = async () => (await prisma.systemConfig.findFirst())?.smtpPassword;

  it("al guardar una contraseña se almacena cifrada y no se devuelve", async () => {
    const res = await put({ smtpHost: "smtp.example.com", smtpPassword: "Secreta-SMTP-1" });
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty("smtpPassword");
    expect(res.body.data.smtpPasswordSet).toBe(true);

    const raw = await stored();
    expect(isEncryptedPII(raw)).toBe(true);
    expect(raw).not.toContain("Secreta-SMTP-1");
    expect(decryptPII(raw)).toBe("Secreta-SMTP-1");
  });

  it("GET no devuelve la contraseña, solo si hay una configurada", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("Secreta-SMTP-1");
    expect(res.body.data).not.toHaveProperty("smtpPassword");
    expect(res.body.data.smtpPasswordSet).toBe(true);
  });

  it("guardar sin contraseña (o vacía) conserva la actual", async () => {
    await put({ smtpHost: "smtp2.example.com" });
    expect(decryptPII(await stored())).toBe("Secreta-SMTP-1");
    await put({ smtpHost: "smtp3.example.com", smtpPassword: "" });
    expect(decryptPII(await stored())).toBe("Secreta-SMTP-1");
  });

  it("smtpPassword: null la borra", async () => {
    const res = await put({ smtpPassword: null });
    expect(res.body.data.smtpPasswordSet).toBe(false);
    expect(await stored()).toBeNull();
  });

  it("no se puede escribir smtpPasswordSet desde fuera", async () => {
    const res = await put({ smtpPasswordSet: true });
    expect(res.status).toBe(200);
    expect(res.body.data.smtpPasswordSet).toBe(false);
  });
});
