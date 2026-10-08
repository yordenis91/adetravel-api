import { z } from "zod";

type WithoutDefault<T> = T extends z.ZodDefault<infer Inner> ? Inner : T;

/**
 * `.partial()` para esquemas de PATCH sin los valores por defecto del esquema de creación.
 *
 * En zod 4, `.partial()` conserva los `.default()`: un PATCH que no envía un campo con valor por
 * defecto lo recibía igualmente y sobrescribía lo guardado (la moneda volvía a CLP, `isPackage` a
 * false, un cliente inactivo se reactivaba...). Aquí se quitan los valores por defecto del primer
 * nivel antes de hacer el esquema parcial: lo que no viene en el cuerpo no se toca.
 */
export function partialUpdate<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [key, field instanceof z.ZodDefault ? field.unwrap() : field])
  ) as { [K in keyof Shape]: WithoutDefault<Shape[K]> };
  return z.object(shape).partial();
}
