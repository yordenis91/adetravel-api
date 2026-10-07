import { loginSchema, registerSchema, updateMeSchema, inviteSchema } from "../../../src/schemas/auth.schemas";

describe("auth.schemas", () => {
  describe("loginSchema", () => {
    it("acepta email y password válidos", () => {
      expect(() =>
        loginSchema.parse({ email: "user@example.com", password: "123456" })
      ).not.toThrow();
    });

    it("rechaza un email inválido", () => {
      expect(() => loginSchema.parse({ email: "no-es-email", password: "123456" })).toThrow();
    });
  });

  describe("registerSchema", () => {
    it("rechaza cuando password y confirmPassword no coinciden", () => {
      expect(() =>
        registerSchema.parse({
          fullName: "Ana Pérez",
          email: "ana@example.com",
          password: "Password123!",
          confirmPassword: "otraCosa123",
        })
      ).toThrow();
    });

    it("acepta cuando ambas contraseñas coinciden", () => {
      expect(() =>
        registerSchema.parse({
          fullName: "Ana Pérez",
          email: "ana@example.com",
          password: "Password123!",
          confirmPassword: "Password123!",
        })
      ).not.toThrow();
    });
  });

  describe("updateMeSchema", () => {
    // Regresión: este schema originalmente no declaraba currentPassword/newPassword,
    // así que validate() los descartaba en silencio y el cambio de contraseña desde
    // "Mi Perfil" nunca llegaba al controller. Ver PerfilPage / auth.controller.
    it("declara currentPassword y newPassword (regresión del bug de cambio de contraseña)", () => {
      const result = updateMeSchema.parse({
        currentPassword: "actual123",
        newPassword: "NuevaPassword123!",
      });
      expect(result.currentPassword).toBe("actual123");
      expect(result.newPassword).toBe("NuevaPassword123!");
    });

    it("permite actualizar solo datos personales sin tocar la contraseña", () => {
      const result = updateMeSchema.parse({ fullName: "Ana Actualizada" });
      expect(result).toEqual({ fullName: "Ana Actualizada" });
    });

    it("rechaza una newPassword menor a 8 caracteres", () => {
      expect(() => updateMeSchema.parse({ newPassword: "corta" })).toThrow();
    });

    it.each(["sinmayuscula1!", "SinNumero!!", "SinSimbolo123"])(
      "rechaza %s por no cumplir la política de contraseñas",
      (newPassword) => {
        expect(() => updateMeSchema.parse({ newPassword })).toThrow();
      }
    );
  });

  describe("inviteSchema", () => {
    it("acepta una invitación válida", () => {
      expect(() =>
        inviteSchema.parse({
          email: "nuevo@example.com",
          fullName: "Nuevo Usuario",
          role: "USUARIO",
          password: "Password123!",
        })
      ).not.toThrow();
    });
  });
});
