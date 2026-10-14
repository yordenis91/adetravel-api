/**
 * `system_config` es una tabla de una sola fila por convención, y todo el código la lee con
 * `findFirst()` sin orden. Si algún día aparece una fila de más, Postgres devolvería una u otra
 * según el plan de consulta. Esta extensión fija el criterio: sin `orderBy` explícito, gana la
 * fila más antigua (la que el panel de Configuración fue rellenando desde el principio).
 */
export const systemConfigExtension = {
  name: "system-config-stable-first",
  query: {
    systemConfig: {
      async findFirst({ args, query }: any) {
        if (!args.orderBy) args.orderBy = [{ createdAt: "asc" }, { id: "asc" }];
        return query(args);
      }
    }
  }
} as const;
