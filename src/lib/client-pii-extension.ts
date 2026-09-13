import { encryptPII, decryptPII } from "./pii-encryption";

/**
 * Cifrado transparente de PII sensible del modelo Client (número de
 * pasaporte, cuenta bancaria, titular de cuenta) en reposo.
 *
 * - Escritura (`query.client.*`): cifra esos 3 campos en `args.data` antes
 *   de que lleguen a Postgres. Cubre create/update/upsert/createMany/
 *   updateMany — las únicas formas en que el código escribe un Client (no
 *   hay creación/edición anidada de Client desde otros modelos).
 * - Lectura (`result.client.*`): cada campo se redefine como un campo
 *   calculado que descifra el valor crudo de la columna. Como los `result`
 *   extensions de Prisma se aplican en CUALQUIER lugar donde aparezca el
 *   modelo Client —incluyendo `include: { client: true }` desde Payment,
 *   Voucher, Request, Quotation, Service—, esto descifra automáticamente
 *   sin tener que tocar cada controller que incluye al cliente relacionado.
 *   Si un `select` explícito no pide estos campos (p.ej. solo
 *   firstName/lastName/email), simplemente no se calculan ni se exponen.
 */

const ENCRYPTED_CLIENT_FIELDS = ["passportNumber", "bankAccount", "bankAccountHolder"] as const;

function encryptClientWriteData<T extends Record<string, unknown>>(data: T): T {
  const result = { ...data };
  for (const field of ENCRYPTED_CLIENT_FIELDS) {
    if (field in result && result[field as keyof T] !== undefined) {
      (result as Record<string, unknown>)[field] = encryptPII(result[field as keyof T] as string | null);
    }
  }
  return result;
}

export const clientPiiExtension = {
  name: "client-pii-encryption",
  query: {
    client: {
      async create({ args, query }: any) {
        if (args.data) args.data = encryptClientWriteData(args.data);
        return query(args);
      },
      async update({ args, query }: any) {
        if (args.data) args.data = encryptClientWriteData(args.data);
        return query(args);
      },
      async upsert({ args, query }: any) {
        if (args.create) args.create = encryptClientWriteData(args.create);
        if (args.update) args.update = encryptClientWriteData(args.update);
        return query(args);
      },
      async createMany({ args, query }: any) {
        if (Array.isArray(args.data)) {
          args.data = args.data.map(encryptClientWriteData);
        }
        return query(args);
      },
      async updateMany({ args, query }: any) {
        if (args.data) args.data = encryptClientWriteData(args.data);
        return query(args);
      }
    }
  },
  result: {
    client: {
      passportNumber: {
        needs: { passportNumber: true },
        compute(client: { passportNumber: string | null }) {
          return decryptPII(client.passportNumber);
        }
      },
      bankAccount: {
        needs: { bankAccount: true },
        compute(client: { bankAccount: string | null }) {
          return decryptPII(client.bankAccount);
        }
      },
      bankAccountHolder: {
        needs: { bankAccountHolder: true },
        compute(client: { bankAccountHolder: string | null }) {
          return decryptPII(client.bankAccountHolder);
        }
      }
    }
  }
} as const;
