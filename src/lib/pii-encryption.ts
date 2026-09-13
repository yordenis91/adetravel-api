import crypto from "crypto";

/**
 * Cifrado simétrico (AES-256-GCM) para PII sensible en reposo (número de
 * pasaporte, cuenta bancaria, titular de cuenta). Formato de salida:
 * "v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>" — el prefijo de
 * versión permite cambiar de algoritmo/clave en el futuro sin romper datos
 * ya cifrados.
 *
 * decryptPII() devuelve el valor tal cual si no reconoce el formato "v1:" —
 * esto permite un rollout seguro: los registros existentes (aún en texto
 * plano hasta que corra el script de backfill) se siguen leyendo bien,
 * mientras que cualquier escritura nueva ya queda cifrada.
 */

const ALGORITHM = "aes-256-gcm";
const VERSION_PREFIX = "v1";
const IV_LENGTH = 12; // recomendado para GCM

function getKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("PII_ENCRYPTION_KEY no está configurada");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("PII_ENCRYPTION_KEY debe ser una clave de 32 bytes en hexadecimal (64 caracteres)");
  }
  return key;
}

export function encryptPII(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return value ?? null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION_PREFIX, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptPII(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return value ?? null;

  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
    // No tiene el formato cifrado esperado: es texto plano heredado
    // (todavía no procesado por el backfill) o un valor que no debía
    // cifrarse. Se devuelve tal cual.
    return value;
  }

  const [, ivB64, authTagB64, ciphertextB64] = parts;
  try {
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const ciphertext = Buffer.from(ciphertextB64, "base64");

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    // Clave incorrecta o dato corrupto: no reventamos toda la respuesta,
    // devolvemos el valor cifrado tal cual para que quede visible que algo
    // falló en vez de lanzar un 500 al listar clientes.
    return value;
  }
}

export function isEncryptedPII(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(":");
  return parts.length === 4 && parts[0] === VERSION_PREFIX;
}
