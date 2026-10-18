import { z } from "zod";

/** Tope de filas por importación: protege la base y el tiempo de respuesta. */
export const MAX_IMPORT_ROWS = 500;

/**
 * Cuerpo de POST /clients/import. Las filas llegan sueltas (`unknown`) a propósito: cada una se valida
 * por separado con `createClientSchema`, para devolver qué fila falla y por qué sin rechazar todo el archivo.
 */
export const importClientsSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1, "El archivo no tiene filas").max(MAX_IMPORT_ROWS, `Máximo ${MAX_IMPORT_ROWS} filas por importación`),
  /** true = solo valida y detecta duplicados, sin guardar nada (vista previa). */
  dryRun: z.boolean().default(false),
});

export type ImportClientsInput = z.infer<typeof importClientsSchema>;
