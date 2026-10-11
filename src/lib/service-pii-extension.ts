import { encryptPII, decryptPII } from "./pii-encryption";

/**
 * Cifrado transparente de PII dentro de `Service.details` (JSON): número de
 * pasaporte y RUT que los servicios de seguro, visa y pasaje aéreo copian de
 * la ficha del cliente. Mismo mecanismo que client-pii-extension.ts.
 *
 * - Escritura: cifra esas claves en `args.data.details` antes de llegar a Postgres.
 * - Lectura: `result.service.details` descifra en cualquier lugar donde aparezca
 *   el modelo (incluido `include: { services: true }`).
 *
 * `details` se reemplaza completo en cada update, así que no hay mezcla de
 * valores cifrados y planos dentro de una misma escritura; los registros
 * antiguos en texto plano se siguen leyendo hasta que corra el backfill.
 */

export const ENCRYPTED_SERVICE_DETAIL_KEYS = ["passportNumber", "rut"] as const;

type Details = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Details => typeof v === "object" && v !== null && !Array.isArray(v);

export function mapServiceDetailsPII(details: unknown, fn: (value: string) => string | null): unknown {
  if (!isPlainObject(details)) return details;
  const out: Details = { ...details };
  for (const key of ENCRYPTED_SERVICE_DETAIL_KEYS) {
    const value = out[key];
    if (typeof value === "string" && value !== "") out[key] = fn(value);
  }
  return out;
}

const encryptDetails = (details: unknown) =>
  mapServiceDetailsPII(details, (v) => (v.startsWith("v1:") && v.split(":").length === 4 ? v : encryptPII(v)));

const decryptDetails = (details: unknown) => mapServiceDetailsPII(details, (v) => decryptPII(v));

function encryptWriteData<T extends Record<string, unknown>>(data: T): T {
  if (!data || data.details === undefined) return data;
  return { ...data, details: encryptDetails(data.details) };
}

export const servicePiiExtension = {
  name: "service-pii-encryption",
  query: {
    service: {
      async create({ args, query }: any) {
        if (args.data) args.data = encryptWriteData(args.data);
        return query(args);
      },
      async update({ args, query }: any) {
        if (args.data) args.data = encryptWriteData(args.data);
        return query(args);
      },
      async upsert({ args, query }: any) {
        if (args.create) args.create = encryptWriteData(args.create);
        if (args.update) args.update = encryptWriteData(args.update);
        return query(args);
      },
      async createMany({ args, query }: any) {
        if (Array.isArray(args.data)) args.data = args.data.map(encryptWriteData);
        return query(args);
      },
      async updateMany({ args, query }: any) {
        if (args.data) args.data = encryptWriteData(args.data);
        return query(args);
      }
    }
  },
  result: {
    service: {
      details: {
        needs: { details: true },
        compute(service: { details: unknown }) {
          return decryptDetails(service.details);
        }
      }
    }
  }
} as const;
