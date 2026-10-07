jest.mock("../../../src/lib/prisma", () => ({ prisma: {} }));

import { isFullyCovered } from "../../../src/services/payment-coverage";

const q = (total: number, currency = "CLP") => ({ total, currency });
const p = (amount: number, currency = "CLP") => ({ amount, currency });

describe("isFullyCovered", () => {
  it("sin cotizaciones aceptadas nunca está cubierto, aunque haya pagos", () => {
    expect(isFullyCovered([], [p(1000000)])).toBe(false);
  });

  it("un pago parcial no cubre", () => {
    expect(isFullyCovered([q(100000)], [p(30000)])).toBe(false);
  });

  it("varios pagos que suman el total cubren", () => {
    expect(isFullyCovered([q(100000)], [p(30000), p(70000)])).toBe(true);
  });

  it("un pago mayor al total también cubre", () => {
    expect(isFullyCovered([q(100000)], [p(120000)])).toBe(true);
  });

  it("suma varias cotizaciones aceptadas", () => {
    expect(isFullyCovered([q(100000), q(50000)], [p(100000)])).toBe(false);
    expect(isFullyCovered([q(100000), q(50000)], [p(150000)])).toBe(true);
  });

  it("compara moneda por moneda: pagar en CLP no cubre una cotización en USD", () => {
    expect(isFullyCovered([q(500, "USD")], [p(900000, "CLP")])).toBe(false);
    expect(isFullyCovered([q(500, "USD"), q(100000, "CLP")], [p(500, "USD"), p(100000, "CLP")])).toBe(true);
  });

  it("tolera el ruido de coma flotante en USD", () => {
    expect(isFullyCovered([q(0.3, "USD")], [p(0.1, "USD"), p(0.2, "USD")])).toBe(true);
  });
});
