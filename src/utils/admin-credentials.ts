import { passwordPolicyIssue } from "./password-policy";

type Env = Record<string, string | undefined>;

/** Contraseñas que alguna vez fueron valores por defecto de los seeds: nunca se aceptan. */
const KNOWN_DEFAULT_PASSWORDS = new Set(["Admin123!", "Agencia123!"]);

/** Credenciales del administrador inicial: obligatorias, con la política de contraseñas y sin valores por defecto. */
export function resolveAdminCredentials(env: Env = process.env): { email: string; password: string } {
  const email = env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("create-admin: define ADMIN_EMAIL y ADMIN_PASSWORD (ya no hay valores por defecto).");
  }
  if (KNOWN_DEFAULT_PASSWORDS.has(password)) {
    throw new Error("create-admin: ADMIN_PASSWORD es una contraseña por defecto conocida; usa otra.");
  }
  const issue = passwordPolicyIssue(password);
  if (issue) throw new Error(`create-admin: ADMIN_PASSWORD no cumple la política: ${issue}`);
  return { email, password };
}
