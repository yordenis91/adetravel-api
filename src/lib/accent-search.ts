import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Búsqueda "contiene" que ignora mayúsculas y tildes ("tomas" encuentra "Tomás", "peru" encuentra "Perú").
 * Prisma no ofrece esto (mode: "insensitive" solo ignora mayúsculas) y no hace falta la extensión
 * `unaccent`: se normaliza con translate() de Postgres, así que no requiere migración.
 *
 * Devuelve los ids que coinciden; el controlador los usa en `where: { id: { in: ids } }`, de modo
 * que el select, los permisos y la paginación siguen siendo los de Prisma.
 */

// Tablas y columnas buscables. Lista cerrada: los nombres se interpolan en el SQL, nunca vienen del usuario.
const SEARCHABLE = {
  clients: ["firstName", "lastName", "email", "phone", "rut"],
  requests: ["requestNumber", "destinationCity", "originCity"],
  vouchers: ["voucherNumber", "serviceName", "destination", "confirmationCode"],
} as const;

export type AccentSearchTable = keyof typeof SEARCHABLE;

const ACCENTED = "ÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇáàâäãéèêëíìîïóòôöõúùûüñç";
const PLAIN = "AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc";

export const normalizeSearchTerm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

type Column<T extends AccentSearchTable> = (typeof SEARCHABLE)[T][number];

/** `columns` limita la búsqueda a un subconjunto de la lista cerrada (por defecto, todas las de la tabla). */
export async function idsMatchingSearch<T extends AccentSearchTable>(
  table: T,
  term: string,
  options: { limit?: number; columns?: readonly Column<T>[] } = {}
): Promise<string[]> {
  const { limit = 1000, columns = SEARCHABLE[table] as readonly Column<T>[] } = options;
  const normalized = normalizeSearchTerm(term.trim());
  if (!normalized) return [];
  const pattern = `%${escapeLike(normalized)}%`;
  // lower() después de translate(): las mayúsculas acentuadas ya son ASCII y no dependen de la configuración regional.
  const conditions = columns.map(
    (column) => Prisma.sql`lower(translate(${Prisma.raw(`"${column}"`)}, ${ACCENTED}, ${PLAIN})) LIKE ${pattern} ESCAPE '\\'`
  );
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE ${Prisma.join(conditions, " OR ")} LIMIT ${limit}`
  );
  return rows.map((r) => r.id);
}
