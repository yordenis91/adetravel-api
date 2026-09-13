import {
  createPaymentSchema,
  updatePaymentSchema,
  changePaymentStatusSchema,
  VALID_TRANSITIONS,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
} from "../../../src/validators/payments.validator";

describe("payments.validator", () => {
  const validPayload = {
    requestId: "req-1",
    amount: 1000,
    method: "TRANSFERENCIA",
  };

  describe("createPaymentSchema", () => {
    it("acepta un payload mínimo válido y aplica el default de moneda", () => {
      const result = createPaymentSchema.parse(validPayload);
      expect(result.currency).toBe("CLP");
      expect(result.amount).toBe(1000);
    });

    it("rechaza cuando falta requestId", () => {
      const { requestId, ...rest } = validPayload;
      expect(() => createPaymentSchema.parse(rest)).toThrow();
    });

    it("rechaza montos negativos o cero", () => {
      expect(() => createPaymentSchema.parse({ ...validPayload, amount: 0 })).toThrow();
      expect(() => createPaymentSchema.parse({ ...validPayload, amount: -50 })).toThrow();
    });

    it("coacciona un monto en string a número", () => {
      const result = createPaymentSchema.parse({ ...validPayload, amount: "500.5" });
      expect(result.amount).toBe(500.5);
    });

    it("rechaza un método de pago fuera del enum", () => {
      expect(() =>
        createPaymentSchema.parse({ ...validPayload, method: "BITCOIN" })
      ).toThrow();
    });

    it("acepta cualquier método de pago declarado", () => {
      for (const method of PAYMENT_METHODS) {
        expect(() => createPaymentSchema.parse({ ...validPayload, method })).not.toThrow();
      }
    });

    it("rechaza una fecha de pago con formato inválido", () => {
      expect(() =>
        createPaymentSchema.parse({ ...validPayload, paymentDate: "01/01/2026" })
      ).toThrow();
    });

    it("acepta una fecha de pago en formato YYYY-MM-DD", () => {
      const result = createPaymentSchema.parse({ ...validPayload, paymentDate: "2026-01-15" });
      expect(result.paymentDate).toBe("2026-01-15");
    });
  });

  describe("updatePaymentSchema", () => {
    it("permite un objeto vacío (todos los campos opcionales)", () => {
      expect(() => updatePaymentSchema.parse({})).not.toThrow();
    });

    it("sigue validando el tipo de los campos provistos", () => {
      expect(() => updatePaymentSchema.parse({ amount: -1 })).toThrow();
    });
  });

  describe("changePaymentStatusSchema", () => {
    it("acepta cualquier estado declarado", () => {
      for (const status of PAYMENT_STATUSES) {
        expect(() => changePaymentStatusSchema.parse({ status })).not.toThrow();
      }
    });

    it("rechaza un estado fuera del enum", () => {
      expect(() => changePaymentStatusSchema.parse({ status: "REEMBOLSADO" })).toThrow();
    });
  });

  describe("VALID_TRANSITIONS", () => {
    it("permite pasar de PENDIENTE a COMPLETADO o CANCELADO", () => {
      expect(VALID_TRANSITIONS.PENDIENTE).toEqual(
        expect.arrayContaining(["COMPLETADO", "CANCELADO"])
      );
    });

    it("permite cancelar un pago ya COMPLETADO (reversa/devolución)", () => {
      expect(VALID_TRANSITIONS.COMPLETADO).toContain("CANCELADO");
    });

    it("no permite pasar directamente de COMPLETADO a PENDIENTE", () => {
      expect(VALID_TRANSITIONS.COMPLETADO).not.toContain("PENDIENTE");
    });

    it("permite reabrir un pago CANCELADO a PENDIENTE", () => {
      expect(VALID_TRANSITIONS.CANCELADO).toEqual(["PENDIENTE"]);
    });
  });
});
