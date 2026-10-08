// Términos y política editables por la agencia: lectura pública, edición solo con permiso. Requiere Postgres migrado.
jest.mock("../src/services/pdf.service", () => ({}));

import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";

const tag = `legal-${Date.now()}`;

describe("documentos legales (integración con Postgres)", () => {
  let admin: any;
  let token: string;
  let original: any;

  beforeAll(async () => {
    admin = await prisma.user.create({
      data: { email: `${tag}@example.com`, fullName: "Admin Legal", passwordHash: "x", role: "ADMINISTRADOR" },
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

  it("sin texto propio la lectura pública devuelve html null", async () => {
    await put({ termsOfServiceHtml: "" });
    const res = await request(app).get("/api/public/legal/terms");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ html: null, updatedAt: null });
  });

  it("guarda el HTML sanitizado, lo publica sin login y sella la fecha", async () => {
    const res = await put({ termsOfServiceHtml: `<h2>Uso</h2><p>Hola</p><script>alert(1)</script>` });
    expect(res.status).toBe(200);
    expect(res.body.data.termsOfServiceHtml).toBe("<h2>Uso</h2><p>Hola</p>");
    expect(res.body.data.termsOfServiceUpdatedAt).toBeTruthy();

    const pub = await request(app).get("/api/public/legal/terms");
    expect(pub.status).toBe(200);
    expect(pub.body.data.html).toBe("<h2>Uso</h2><p>Hola</p>");
    expect(pub.body.data.updatedAt).toBeTruthy();
  });

  it("el cliente no puede fijar la fecha de actualización", async () => {
    const before = (await request(app).get("/api/public/legal/terms")).body.data.updatedAt;
    await put({ termsOfServiceHtml: "<h2>Uso</h2><p>Hola</p>", termsOfServiceUpdatedAt: "2000-01-01T00:00:00.000Z" });
    const after = (await request(app).get("/api/public/legal/terms")).body.data.updatedAt;
    expect(after).toBe(before);
  });

  it("política de privacidad es independiente y un documento desconocido da 404", async () => {
    await put({ privacyPolicyHtml: "<p>Privado</p>" });
    expect((await request(app).get("/api/public/legal/privacy")).body.data.html).toBe("<p>Privado</p>");
    expect((await request(app).get("/api/public/legal/otro")).status).toBe(404);
  });

  it("editar requiere sesión", async () => {
    const res = await request(app).put("/api/system-config").send({ termsOfServiceHtml: "<p>x</p>" });
    expect(res.status).toBe(401);
  });
});
