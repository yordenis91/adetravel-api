import { createClientSchema, updateClientSchema } from "../../../src/validators/clients.validator";

describe("clients.validator (PII)", () => {
  const minimalValid = { firstName: "Ana", lastName: "Pérez" };

  describe("createClientSchema", () => {
    it("acepta el payload mínimo (solo nombre y apellido)", () => {
      const result = createClientSchema.parse(minimalValid);
      expect(result.firstName).toBe("Ana");
      expect(result.isActive).toBe(true);
      expect(result.frequentFlyerNumbers).toEqual([]);
    });

    it("rechaza cuando falta firstName o lastName", () => {
      expect(() => createClientSchema.parse({ lastName: "Pérez" })).toThrow();
      expect(() => createClientSchema.parse({ firstName: "Ana" })).toThrow();
    });

    it("acepta email vacío (formulario sin email) pero rechaza uno malformado", () => {
      expect(() => createClientSchema.parse({ ...minimalValid, email: "" })).not.toThrow();
      expect(() =>
        createClientSchema.parse({ ...minimalValid, email: "no-es-un-email" })
      ).toThrow();
    });

    it("acepta datos de pasaporte válidos y respeta los límites de longitud", () => {
      const result = createClientSchema.parse({
        ...minimalValid,
        passportNumber: "P1234567",
        passportCountry: "Chile",
        passportExpiry: "2030-01-01",
      });
      expect(result.passportNumber).toBe("P1234567");
    });

    it("rechaza un passportNumber que exceda el largo máximo", () => {
      expect(() =>
        createClientSchema.parse({ ...minimalValid, passportNumber: "P".repeat(31) })
      ).toThrow();
    });

    it("valida el email bancario (bankEmail) igual que el email personal", () => {
      expect(() =>
        createClientSchema.parse({ ...minimalValid, bankEmail: "" })
      ).not.toThrow();
      expect(() =>
        createClientSchema.parse({ ...minimalValid, bankEmail: "no-valido" })
      ).toThrow();
      expect(() =>
        createClientSchema.parse({ ...minimalValid, bankEmail: "banco@ejemplo.com" })
      ).not.toThrow();
    });

    it("acepta datos bancarios completos dentro de sus límites", () => {
      const result = createClientSchema.parse({
        ...minimalValid,
        bankAccount: "0001234567",
        bankName: "Banco Estado",
        bankAccountHolder: "Ana Pérez",
        bankEmail: "ana@ejemplo.com",
      });
      expect(result.bankAccountHolder).toBe("Ana Pérez");
    });

    it("rechaza un referralSource fuera del enum permitido", () => {
      expect(() =>
        createClientSchema.parse({ ...minimalValid, referralSource: "INSTAGRAM" })
      ).toThrow();
    });
  });

  describe("updateClientSchema", () => {
    it("permite un objeto vacío (edición parcial)", () => {
      expect(() => updateClientSchema.parse({})).not.toThrow();
    });

    it("sigue rechazando un email inválido en edición parcial", () => {
      expect(() => updateClientSchema.parse({ email: "invalido" })).toThrow();
    });

    it("permite actualizar únicamente el campo bancario sin tocar el resto del PII", () => {
      // Nota: isActive/frequentFlyerNumbers tienen .default() en el schema base,
      // así que .partial() los sigue completando aunque no vengan en el payload.
      const result = updateClientSchema.parse({ bankAccount: "9999999999" });
      expect(result).toMatchObject({ bankAccount: "9999999999" });
      expect(result).not.toHaveProperty("passportNumber");
      expect(result).not.toHaveProperty("bankName");
    });
  });
});
