const mockFindFirst = jest.fn();
jest.mock("../../../src/lib/prisma", () => ({ prisma: { systemConfig: { findFirst: mockFindFirst } } }));

import { getAgencyHeader, getAgencyInfo } from "../../../src/services/agency.service";

describe("getAgencyHeader", () => {
  beforeEach(() => mockFindFirst.mockReset());

  it("usa los datos configurados de la agencia", async () => {
    mockFindFirst.mockResolvedValue({
      agencyName: "Viajes Sur SpA", agencyFantasyName: "Viajes Sur", agencyRut: "76.123.456-7",
      agencyAddress: "Av. Providencia 123", agencyPhone: "+56 2 2345 6789", agencyEmail: "hola@viajessur.cl",
    });
    await expect(getAgencyHeader()).resolves.toEqual({
      name: "Viajes Sur",
      rut: "76.123.456-7",
      contact: "Av. Providencia 123 · +56 2 2345 6789 · hola@viajessur.cl",
    });
  });

  it("sin configuración usa el nombre por defecto y NO inventa un RUT", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(getAgencyHeader()).resolves.toEqual({ name: "ADE Travel", rut: undefined, contact: undefined });
  });

  it("cae a la razón social si no hay nombre de fantasía y omite campos vacíos", async () => {
    mockFindFirst.mockResolvedValue({ agencyName: "Viajes Sur SpA", agencyFantasyName: " ", agencyRut: "", agencyPhone: "+56 9 1111 2222" });
    await expect(getAgencyHeader()).resolves.toEqual({ name: "Viajes Sur SpA", rut: undefined, contact: "+56 9 1111 2222" });
  });
});

describe("getAgencyInfo", () => {
  beforeEach(() => mockFindFirst.mockReset());

  it("devuelve solo los campos públicos y limpia espacios", async () => {
    mockFindFirst.mockResolvedValue({
      agencyName: " Viajes Sur SpA ", agencyFantasyName: " ", agencyRut: "76.123.456-7", agencyAddress: " Av. Providencia 123 ",
      agencyPhone: "+56 2 2345 6789", agencyEmail: "hola@viajessur.cl", agencyWebsite: "www.viajessur.cl",
      smtpHost: "smtp.secreto.com", smtpPassword: "v1:cifrado", exchangeRates: "[]",
    });
    const info = await getAgencyInfo();
    expect(info).toEqual({
      name: "Viajes Sur SpA", rut: "76.123.456-7", address: "Av. Providencia 123",
      phone: "+56 2 2345 6789", email: "hola@viajessur.cl", website: "www.viajessur.cl",
    });
    expect(Object.keys(info).sort()).toEqual(["address", "email", "name", "phone", "rut", "website"]);
  });

  it("sin configuración usa el nombre por defecto y deja el resto en null (nada inventado)", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(getAgencyInfo()).resolves.toEqual({ name: "ADE Travel", rut: null, address: null, phone: null, email: null, website: null });
  });

  it("prefiere el nombre de fantasía al legal", async () => {
    mockFindFirst.mockResolvedValue({ agencyName: "Viajes Sur SpA", agencyFantasyName: "Viajes Sur" });
    expect((await getAgencyInfo()).name).toBe("Viajes Sur");
  });
});
