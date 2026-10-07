import { createQuotationSchema, updateQuotationSchema } from "../../../src/validators/quotations.validator";

const item = { service: "Hotel", description: "", quantity: 1, unitPrice: 1000, total: 1000 };

describe("quotations.validator", () => {
  it("la creación aplica los valores por defecto (CLP, IVA 0, descuento 0)", () => {
    const parsed = createQuotationSchema.parse({ requestId: "r1", clientId: "c1", items: [item] });
    expect(parsed).toMatchObject({ currency: "CLP", taxPercentage: 0, discount: 0 });
  });

  // Regresión: con los defaults en el esquema base, `.partial()` los inyectaba y editar solo las
  // notas dejaba IVA = 0, descuento = 0 y moneda = CLP, recalculando el total sin IVA.
  it("un PATCH parcial NO inyecta moneda, IVA ni descuento", () => {
    const parsed = updateQuotationSchema.parse({ notes: "solo las notas" });
    expect(parsed).toEqual({ notes: "solo las notas" });
    expect(parsed).not.toHaveProperty("taxPercentage");
    expect(parsed).not.toHaveProperty("discount");
    expect(parsed).not.toHaveProperty("currency");
  });

  it("un PATCH respeta los valores que sí se envían", () => {
    const parsed = updateQuotationSchema.parse({ taxPercentage: 19, discount: 500, currency: "USD" });
    expect(parsed).toEqual({ taxPercentage: 19, discount: 500, currency: "USD" });
  });

  it("un PATCH sigue rechazando una lista de ítems vacía", () => {
    expect(() => updateQuotationSchema.parse({ items: [] })).toThrow();
  });
});
