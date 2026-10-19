// Límites de las páginas públicas de cotización: frenan el barrido de códigos y el abuso de los formularios.
process.env.RATE_LIMIT_MAX = "100000";
process.env.PUBLIC_READ_RATE_LIMIT_MAX = "4";
process.env.PUBLIC_WRITE_RATE_LIMIT_MAX = "2";
process.env.PUBLIC_PDF_RATE_LIMIT_MAX = "1";

jest.mock("../src/services/pdf.service", () => ({}));

import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../src/lib/prisma");

const fake = "a".repeat(75);

describe("límite de peticiones de las páginas públicas de cotización", () => {
  afterAll(async () => { await prisma.$disconnect(); });

  it("la lectura se corta con 429 tras el máximo, aunque los códigos sean falsos (barrido de códigos)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await request(app).get(`/api/public/quotations/${fake}`)).status);
    expect(statuses).toEqual([404, 404, 404, 404, 429, 429]);
  });

  it("aceptar/consultar tienen su propio cupo, más bajo", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await request(app).post(`/api/public/quotations/${fake}/question`).send({ message: "hola" })).status);
    expect(statuses).toEqual([404, 404, 429]);
  });

  it("el PDF también (es costoso de generar)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 2; i++) statuses.push((await request(app).get(`/api/public/quotations/${fake}/pdf`)).status);
    expect(statuses).toEqual([404, 429]);
  });
});
