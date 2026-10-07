import { calculateTotals, normalizeItems } from "../../../src/services/quotation.calc";
import { formatMoney, roundMoney } from "../../../src/utils/money";

const line = (quantity: number, unitPrice: number) => ({ service: "S", description: "", quantity, unitPrice, total: 0 });

describe("quotation.calc", () => {
  describe("CLP (sin decimales)", () => {
    it("calcula subtotal, IVA 19% y total con enteros", () => {
      const items = normalizeItems([line(2, 50000), line(1, 12345)], "CLP");
      expect(calculateTotals(items, 19, 0, "CLP")).toEqual({ subtotal: 112345, taxAmount: 21346, total: 133691 });
    });

    it("aplica el descuento antes del IVA y no baja de cero", () => {
      const items = normalizeItems([line(1, 100000)], "CLP");
      expect(calculateTotals(items, 19, 10000, "CLP")).toEqual({ subtotal: 100000, taxAmount: 17100, total: 107100 });
      expect(calculateTotals(items, 19, 999999, "CLP")).toEqual({ subtotal: 100000, taxAmount: 0, total: 0 });
    });

    it("usa CLP por defecto", () => {
      expect(calculateTotals(normalizeItems([line(1, 1000)]), 0, 0).total).toBe(1000);
    });
  });

  // Regresión: antes todo se redondeaba a enteros y en USD se perdían los centavos.
  describe("USD (2 decimales)", () => {
    it("conserva los centavos en las líneas", () => {
      const items = normalizeItems([line(1, 10.5), line(3, 19.99)], "USD");
      expect(items.map((i) => i.total)).toEqual([10.5, 59.97]);
    });

    it("subtotal - descuento + IVA = total, sin ruido de coma flotante", () => {
      const items = normalizeItems([line(1, 10.5), line(3, 19.99)], "USD");
      const totals = calculateTotals(items, 19, 0, "USD");
      expect(totals).toEqual({ subtotal: 70.47, taxAmount: 13.39, total: 83.86 });
      expect(roundMoney(totals.subtotal + totals.taxAmount, "USD")).toBe(totals.total);
    });

    it("suma 0.1 + 0.2 sin arrastrar 0.30000000000000004", () => {
      const items = normalizeItems([line(1, 0.1), line(1, 0.2)], "USD");
      expect(calculateTotals(items, 0, 0, "USD").subtotal).toBe(0.3);
    });
  });

  describe("formatMoney", () => {
    it("muestra decimales solo en monedas que los usan", () => {
      expect(formatMoney(1234567, "CLP")).toBe("1.234.567");
      expect(formatMoney(1234.5, "USD")).toBe("1.234,50");
    });
  });
});
