import { additionalEmailsSchema, MAX_ADDITIONAL_EMAILS } from "../../../src/validators/email-list";
import { createClientSchema, updateClientSchema } from "../../../src/validators/clients.validator";
import { providerCreateSchema, providerUpdateSchema } from "../../../src/schemas/domain.schemas";

describe("additionalEmailsSchema", () => {
  it("limpia espacios y descarta filas vacías", () => {
    expect(additionalEmailsSchema.parse(["  ana@example.com ", "", "   ", "luis@example.com"])).toEqual([
      "ana@example.com",
      "luis@example.com",
    ]);
  });

  it("quita repetidos sin distinguir mayúsculas y deja el primero tal como se escribió", () => {
    expect(additionalEmailsSchema.parse(["Ana@Example.com", "ana@example.com", "ANA@EXAMPLE.COM", "b@example.com"])).toEqual([
      "Ana@Example.com",
      "b@example.com",
    ]);
  });

  it("rechaza correos mal escritos", () => {
    for (const bad of ["sin-arroba", "a@b", "a b@c.com", "a@b.com,c@d.com"]) {
      expect(additionalEmailsSchema.safeParse([bad]).success).toBe(false);
    }
  });

  it("rechaza elementos que no son texto y valores que no son lista", () => {
    expect(additionalEmailsSchema.safeParse([123]).success).toBe(false);
    expect(additionalEmailsSchema.safeParse([null]).success).toBe(false);
    expect(additionalEmailsSchema.safeParse("a@b.com").success).toBe(false);
  });

  it(`admite hasta ${MAX_ADDITIONAL_EMAILS} y rechaza más`, () => {
    const emails = (n: number) => Array.from({ length: n }, (_, i) => `persona${i}@example.com`);
    expect(additionalEmailsSchema.safeParse(emails(MAX_ADDITIONAL_EMAILS)).success).toBe(true);
    expect(additionalEmailsSchema.safeParse(emails(MAX_ADDITIONAL_EMAILS + 1)).success).toBe(false);
  });

  it("las filas vacías no cuentan para el máximo", () => {
    const list = [...Array.from({ length: MAX_ADDITIONAL_EMAILS }, (_, i) => `p${i}@example.com`), "", " "];
    expect(additionalEmailsSchema.safeParse(list).success).toBe(true);
  });
});

describe("esquemas de cliente y proveedor", () => {
  const base = { firstName: "Lucía", lastName: "Navarro" };

  it("cliente: al crear, sin enviar correos adicionales queda lista vacía", () => {
    expect(createClientSchema.parse(base).additionalEmails).toEqual([]);
  });

  it("cliente: al editar, si no se envían, no se tocan (no se vacían por el valor por defecto)", () => {
    expect("additionalEmails" in updateClientSchema.parse({ firstName: "Otra" })).toBe(false);
  });

  it("cliente: al editar se pueden vaciar enviando lista vacía", () => {
    expect(updateClientSchema.parse({ additionalEmails: [] }).additionalEmails).toEqual([]);
  });

  it("proveedor: valida y normaliza los correos adicionales, y no exige enviarlos", () => {
    expect(providerCreateSchema.parse({ name: "Hotel Andes", additionalEmails: [" a@b.cl ", "A@B.cl"] }).additionalEmails).toEqual(["a@b.cl"]);
    expect("additionalEmails" in providerCreateSchema.parse({ name: "Hotel Andes" })).toBe(false);
    expect("additionalEmails" in providerUpdateSchema.parse({ name: "Hotel Andes 2" })).toBe(false);
    expect(providerCreateSchema.safeParse({ name: "Hotel Andes", additionalEmails: ["malo"] }).success).toBe(false);
  });
});
