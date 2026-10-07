import { assertDemoSeedAllowed, resolveAdminCredentials, resolveSeedUsersPassword } from "../../../prisma/seed-guard";

describe("salvaguardas de los seeds", () => {
  describe("resolveAdminCredentials", () => {
    it("exige ADMIN_EMAIL y ADMIN_PASSWORD: ya no hay valores por defecto", () => {
      expect(() => resolveAdminCredentials({})).toThrow(/ADMIN_EMAIL y ADMIN_PASSWORD/);
      expect(() => resolveAdminCredentials({ ADMIN_EMAIL: "a@b.cl" })).toThrow(/ADMIN_EMAIL y ADMIN_PASSWORD/);
    });

    it("rechaza las contraseñas por defecto conocidas aunque cumplan la política", () => {
      expect(() => resolveAdminCredentials({ ADMIN_EMAIL: "a@b.cl", ADMIN_PASSWORD: "Admin123!" })).toThrow(/por defecto/);
      expect(() => resolveAdminCredentials({ ADMIN_EMAIL: "a@b.cl", ADMIN_PASSWORD: "Agencia123!" })).toThrow(/por defecto/);
    });

    it("aplica la política de contraseñas", () => {
      expect(() => resolveAdminCredentials({ ADMIN_EMAIL: "a@b.cl", ADMIN_PASSWORD: "corta" })).toThrow(/política/);
    });

    it("normaliza el correo y devuelve las credenciales válidas", () => {
      expect(resolveAdminCredentials({ ADMIN_EMAIL: "  Admin@AdeTravel.CL ", ADMIN_PASSWORD: "Segura-2026!" })).toEqual({
        email: "admin@adetravel.cl",
        password: "Segura-2026!",
      });
    });
  });

  describe("assertDemoSeedAllowed", () => {
    it("bloquea los datos de ejemplo en producción", () => {
      expect(() => assertDemoSeedAllowed("seed-flow", { NODE_ENV: "production" })).toThrow(/NODE_ENV=production/);
    });

    it("permite producción solo con ALLOW_DEMO_SEED=true, y siempre fuera de producción", () => {
      expect(() => assertDemoSeedAllowed("seed-flow", { NODE_ENV: "production", ALLOW_DEMO_SEED: "true" })).not.toThrow();
      expect(() => assertDemoSeedAllowed("seed-flow", { NODE_ENV: "development" })).not.toThrow();
      expect(() => assertDemoSeedAllowed("seed-flow", {})).not.toThrow();
    });
  });

  describe("resolveSeedUsersPassword", () => {
    it("usa la contraseña de desarrollo solo fuera de producción", () => {
      expect(resolveSeedUsersPassword({})).toBe("Agencia123!");
      expect(() => resolveSeedUsersPassword({ NODE_ENV: "production" })).toThrow(/SEED_USERS_PASSWORD/);
    });

    it("una contraseña explícita debe cumplir la política", () => {
      expect(resolveSeedUsersPassword({ SEED_USERS_PASSWORD: "Pruebas-2026!" })).toBe("Pruebas-2026!");
      expect(() => resolveSeedUsersPassword({ SEED_USERS_PASSWORD: "abc" })).toThrow(/política/);
    });
  });
});
