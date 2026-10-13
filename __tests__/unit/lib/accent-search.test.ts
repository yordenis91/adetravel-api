const mockQueryRaw = jest.fn();
jest.mock("../../../src/lib/prisma", () => ({ prisma: { $queryRaw: mockQueryRaw } }));

import { idsMatchingSearch, normalizeSearchTerm } from "../../../src/lib/accent-search";

const lastQuery = () => mockQueryRaw.mock.calls[mockQueryRaw.mock.calls.length - 1][0] as { sql: string; values: unknown[] };

describe("normalizeSearchTerm", () => {
  it("quita tildes, pasa a minúsculas y trata la ñ como n", () => {
    expect(normalizeSearchTerm("TOMÁS")).toBe("tomas");
    expect(normalizeSearchTerm("Niño")).toBe("nino");
    expect(normalizeSearchTerm("Perú")).toBe("peru");
    expect(normalizeSearchTerm("François")).toBe("francois");
  });
});

describe("idsMatchingSearch", () => {
  beforeEach(() => mockQueryRaw.mockReset().mockResolvedValue([{ id: "a" }, { id: "b" }]));

  it("devuelve los ids de las filas encontradas", async () => {
    await expect(idsMatchingSearch("clients", "tomas")).resolves.toEqual(["a", "b"]);
  });

  it("un término vacío no consulta la base", async () => {
    await expect(idsMatchingSearch("clients", "   ")).resolves.toEqual([]);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("el término va como parámetro (nunca dentro del SQL) y normalizado", async () => {
    await idsMatchingSearch("clients", "Tomás'; DROP TABLE clients;--");
    const { sql, values } = lastQuery();
    expect(sql).not.toContain("DROP");
    expect(values).toContain("%tomas'; drop table clients;--%");
  });

  it("escapa % y _ para que no actúen como comodines", async () => {
    await idsMatchingSearch("clients", "50%_a\\b");
    expect(lastQuery().values).toContain("%50\\%\\_a\\\\b%");
  });

  it("clients busca en nombre, apellido, correo, teléfono y RUT, pero nunca en el pasaporte (va cifrado)", async () => {
    await idsMatchingSearch("clients", "ana");
    const { sql } = lastQuery();
    for (const column of ["firstName", "lastName", "email", "phone", "rut"]) expect(sql).toContain(`"${column}"`);
    expect(sql).not.toContain("passportNumber");
    expect(sql).not.toContain("bankAccount");
  });

  it("`columns` limita la búsqueda a un subconjunto y `limit` se aplica", async () => {
    await idsMatchingSearch("clients", "ana", { limit: 5, columns: ["firstName", "email"] });
    const { sql, values } = lastQuery();
    expect(sql).toContain('"firstName"');
    expect(sql).toContain('"email"');
    expect(sql).not.toContain('"phone"');
    expect(values).toContain(5);
  });

  it("consulta la tabla pedida y usa translate()+lower() con ESCAPE", async () => {
    await idsMatchingSearch("vouchers", "excursion");
    const { sql } = lastQuery();
    expect(sql).toContain('FROM "vouchers"');
    expect(sql).toMatch(/lower\(translate\(/);
    expect(sql).toContain("ESCAPE");
  });
});
