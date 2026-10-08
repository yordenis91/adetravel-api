import { passwordPolicyIssue } from "../src/utils/password-policy";

export { resolveAdminCredentials } from "../src/utils/admin-credentials";

/**
 * Salvaguardas de los seeds. Los seeds de datos de ejemplo (usuarios de prueba, clientes,
 * proveedores, flujo completo) crean registros y contraseñas conocidas: nunca deben correr
 * contra producción por accidente. El de administrador sí se usa en producción, pero solo
 * con credenciales explícitas.
 */

type Env = Record<string, string | undefined>;

/** Lanza si se intenta sembrar datos de ejemplo con NODE_ENV=production (salvo ALLOW_DEMO_SEED=true). */
export function assertDemoSeedAllowed(seedName: string, env: Env = process.env): void {
  if (env.NODE_ENV === "production" && env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      `${seedName}: crea datos de ejemplo y no se ejecuta con NODE_ENV=production. ` +
        "Si de verdad es una base de demostración, define ALLOW_DEMO_SEED=true."
    );
  }
}

/** Contraseña de los usuarios de prueba: la por defecto solo fuera de producción. */
export function resolveSeedUsersPassword(env: Env = process.env): string {
  const password = env.SEED_USERS_PASSWORD;
  if (password) {
    const issue = passwordPolicyIssue(password);
    if (issue) throw new Error(`seed-users: SEED_USERS_PASSWORD no cumple la política: ${issue}`);
    return password;
  }
  if (env.NODE_ENV === "production") {
    throw new Error("seed-users: con NODE_ENV=production define SEED_USERS_PASSWORD; no se usa la contraseña por defecto.");
  }
  return "Agencia123!";
}
