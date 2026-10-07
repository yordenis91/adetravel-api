import { passwordPolicyIssue } from "../src/utils/password-policy";

/**
 * Salvaguardas de los seeds. Los seeds de datos de ejemplo (usuarios de prueba, clientes,
 * proveedores, flujo completo) crean registros y contraseñas conocidas: nunca deben correr
 * contra producción por accidente. El de administrador sí se usa en producción, pero solo
 * con credenciales explícitas.
 */

type Env = Record<string, string | undefined>;

/** Contraseñas que alguna vez fueron valores por defecto de los seeds: nunca se aceptan. */
const KNOWN_DEFAULT_PASSWORDS = new Set(["Admin123!", "Agencia123!"]);

/** Lanza si se intenta sembrar datos de ejemplo con NODE_ENV=production (salvo ALLOW_DEMO_SEED=true). */
export function assertDemoSeedAllowed(seedName: string, env: Env = process.env): void {
  if (env.NODE_ENV === "production" && env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      `${seedName}: crea datos de ejemplo y no se ejecuta con NODE_ENV=production. ` +
        "Si de verdad es una base de demostración, define ALLOW_DEMO_SEED=true."
    );
  }
}

/** Credenciales del administrador inicial: obligatorias, con la política de contraseñas y sin valores por defecto. */
export function resolveAdminCredentials(env: Env = process.env): { email: string; password: string } {
  const email = env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("seed-admin: define ADMIN_EMAIL y ADMIN_PASSWORD (ya no hay valores por defecto).");
  }
  if (KNOWN_DEFAULT_PASSWORDS.has(password)) {
    throw new Error("seed-admin: ADMIN_PASSWORD es una contraseña por defecto conocida; usa otra.");
  }
  const issue = passwordPolicyIssue(password);
  if (issue) throw new Error(`seed-admin: ADMIN_PASSWORD no cumple la política: ${issue}`);
  return { email, password };
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
