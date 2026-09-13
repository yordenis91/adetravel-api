import { updateUserSchema, userIdParamSchema } from "../../../src/validators/users.validator";

describe("users.validator", () => {
  describe("updateUserSchema", () => {
    // Regresión: el schema original no declaraba fullName/email/password, así que
    // "Editar Perfil de Usuario" desde Gestión de Usuarios (incluido el reseteo de
    // contraseña por un administrador) se descartaba en silencio en validate().
    it("declara fullName, email y password (regresión del bug de edición de usuarios)", () => {
      const result = updateUserSchema.parse({
        fullName: "Nuevo Nombre",
        email: "nuevo@example.com",
        password: "nuevaPassword123",
      });
      expect(result.fullName).toBe("Nuevo Nombre");
      expect(result.email).toBe("nuevo@example.com");
      expect(result.password).toBe("nuevaPassword123");
    });

    it("rechaza una password de reseteo menor a 8 caracteres", () => {
      expect(() => updateUserSchema.parse({ password: "corta" })).toThrow();
    });

    it("rechaza un email con formato inválido", () => {
      expect(() => updateUserSchema.parse({ email: "invalido" })).toThrow();
    });

    it("permite un objeto vacío (ningún campo es obligatorio)", () => {
      expect(() => updateUserSchema.parse({})).not.toThrow();
    });

    it("acepta limpiar agencyRole y department a null", () => {
      const result = updateUserSchema.parse({ agencyRole: null, department: null });
      expect(result.agencyRole).toBeNull();
      expect(result.department).toBeNull();
    });

    it("rechaza un role fuera del enum de sistema", () => {
      expect(() => updateUserSchema.parse({ role: "SUPERADMIN" })).toThrow();
    });
  });

  describe("userIdParamSchema", () => {
    it("acepta un UUID válido", () => {
      expect(() =>
        userIdParamSchema.parse({ id: "123e4567-e89b-12d3-a456-426614174000" })
      ).not.toThrow();
    });

    it("rechaza un id que no es UUID", () => {
      expect(() => userIdParamSchema.parse({ id: "no-es-uuid" })).toThrow();
    });
  });
});
