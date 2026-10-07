import { z } from "zod";

/**
 * Política única de contraseñas (registro, invitación, cambio de contraseña y reset).
 * Devuelve el mensaje del primer requisito que falla, o null si la contraseña cumple.
 */
export function passwordPolicyIssue(password: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (!/[A-Z]/.test(password)) return "La contraseña debe incluir al menos una letra mayúscula";
  if (!/[0-9]/.test(password)) return "La contraseña debe incluir al menos un número";
  if (!/[!@#$%^&*]/.test(password)) {
    return "La contraseña debe incluir al menos un carácter especial (!@#$%^&*)";
  }
  return null;
}

/** Esquema zod con la misma política, para los schemas de validación de las rutas. */
export const passwordSchema = z.string().superRefine((value, ctx) => {
  const issue = passwordPolicyIssue(value);
  if (issue) ctx.addIssue({ code: "custom", message: issue });
});
