import { catalogSchema, catalogQuerySchema } from "../../../src/validators/catalog.validator";

describe("catalog.validator", () => {
  describe("catalogSchema", () => {
    // Regresión: el schema original no declaraba isActive, así que el botón
    // "Reactivar" de los nomencladores no tenía efecto (validate() lo descartaba).
    it("declara isActive (regresión del bug de reactivación de nomencladores)", () => {
      const schema = catalogSchema();
      const result = schema.parse({ name: "Chile", isActive: true });
      expect(result.isActive).toBe(true);
    });

    it("permite omitir isActive", () => {
      const schema = catalogSchema();
      expect(() => schema.parse({ name: "Chile" })).not.toThrow();
    });

    it("rechaza un name vacío", () => {
      const schema = catalogSchema();
      expect(() => schema.parse({ name: "" })).toThrow();
    });

    it("exige el campo padre cuando parentRequired es true", () => {
      const schema = catalogSchema("countryId", true);
      expect(() => schema.parse({ name: "Santiago" })).toThrow();
      expect(() => schema.parse({ name: "Santiago", countryId: "cl" })).not.toThrow();
    });

    it("hace opcional el campo padre cuando parentRequired es false", () => {
      const schema = catalogSchema("countryId", false);
      expect(() => schema.parse({ name: "Santiago" })).not.toThrow();
    });
  });

  describe("catalogQuerySchema", () => {
    it("coacciona page y limit desde query strings", () => {
      const result = catalogQuerySchema.parse({ page: "2", limit: "10" });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });

    it("es passthrough: no descarta parámetros de query adicionales", () => {
      const result = catalogQuerySchema.parse({ search: "x", parentId: "abc" });
      expect(result).toMatchObject({ search: "x", parentId: "abc" });
    });
  });
});
