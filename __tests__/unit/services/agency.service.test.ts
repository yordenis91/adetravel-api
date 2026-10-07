const mockFindFirst = jest.fn();
jest.mock("../../../src/lib/prisma", () => ({ prisma: { systemConfig: { findFirst: mockFindFirst } } }));

import { getAgencyHeader } from "../../../src/services/agency.service";

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
