import { encryptPII, decryptPII, isEncryptedPII } from "../../../src/lib/pii-encryption";

describe("pii-encryption", () => {
  describe("encryptPII / decryptPII round-trip", () => {
    it("descifra exactamente el valor original", () => {
      const plaintext = "P1234567";
      const ciphertext = encryptPII(plaintext);
      expect(ciphertext).not.toBe(plaintext);
      expect(decryptPII(ciphertext)).toBe(plaintext);
    });

    it("produce un ciphertext distinto cada vez para el mismo valor (IV aleatorio)", () => {
      const a = encryptPII("0001234567");
      const b = encryptPII("0001234567");
      expect(a).not.toBe(b);
      expect(decryptPII(a)).toBe("0001234567");
      expect(decryptPII(b)).toBe("0001234567");
    });

    it("nunca deja el texto plano visible dentro del ciphertext", () => {
      const plaintext = "CuentaSecreta123456";
      const ciphertext = encryptPII(plaintext)!;
      expect(ciphertext).not.toContain(plaintext);
    });

    it("maneja null/undefined/'' sin lanzar", () => {
      expect(encryptPII(null)).toBeNull();
      expect(encryptPII(undefined)).toBeNull();
      expect(encryptPII("")).toBe("");
      expect(decryptPII(null)).toBeNull();
      expect(decryptPII(undefined)).toBeNull();
      expect(decryptPII("")).toBe("");
    });

    it("soporta caracteres especiales y unicode", () => {
      const plaintext = "José Ñáñez - Cta N° 123.456-7 (España) 🇪🇸";
      expect(decryptPII(encryptPII(plaintext))).toBe(plaintext);
    });
  });

  describe("rollout seguro: texto plano heredado", () => {
    it("decryptPII devuelve tal cual un valor que no tiene el formato cifrado (dato preexistente sin migrar)", () => {
      expect(decryptPII("P1234567")).toBe("P1234567");
      expect(decryptPII("0001234567")).toBe("0001234567");
    });

    it("decryptPII no lanza ante un ciphertext corrupto/con clave equivocada, devuelve el valor tal cual", () => {
      const fakeCiphertext = "v1:aW52YWxpZA==:aW52YWxpZA==:aW52YWxpZA==";
      expect(() => decryptPII(fakeCiphertext)).not.toThrow();
      expect(decryptPII(fakeCiphertext)).toBe(fakeCiphertext);
    });
  });

  describe("isEncryptedPII", () => {
    it("reconoce un valor cifrado por encryptPII", () => {
      expect(isEncryptedPII(encryptPII("P1234567")!)).toBe(true);
    });

    it("no confunde texto plano con un valor cifrado", () => {
      expect(isEncryptedPII("P1234567")).toBe(false);
      expect(isEncryptedPII(null)).toBe(false);
      expect(isEncryptedPII(undefined)).toBe(false);
      expect(isEncryptedPII("")).toBe(false);
    });
  });
});
