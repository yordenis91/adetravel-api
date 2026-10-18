import { z } from "zod";

/** Máximo de correos adicionales por cliente o proveedor (además del principal). */
export const MAX_ADDITIONAL_EMAILS = 10;

/**
 * Lista de correos adicionales: se limpian espacios, se descartan las entradas vacías (el formulario
 * puede enviar filas en blanco) y los repetidos (sin distinguir mayúsculas; queda el primero con su
 * escritura original). Cada correo restante debe ser válido.
 */
export const additionalEmailsSchema = z.preprocess(
  (value) => {
    if (!Array.isArray(value)) return value;
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const item of value) {
      if (typeof item !== "string") {
        out.push(item); // lo rechaza la validación de abajo
        continue;
      }
      const email = item.trim();
      if (!email) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(email);
    }
    return out;
  },
  z
    .array(z.string().email("Correo adicional inválido").max(254, "Correo adicional demasiado largo"))
    .max(MAX_ADDITIONAL_EMAILS, `Máximo ${MAX_ADDITIONAL_EMAILS} correos adicionales`)
);
