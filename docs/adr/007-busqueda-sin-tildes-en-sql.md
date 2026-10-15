# ADR 007: Búsqueda que ignora tildes con `translate()` y `lower()` en SQL

Estado: Aceptada

## Contexto

Escribir «peru» o «tomas» debe encontrar «Perú» o «Tomás». Prisma solo ignora mayúsculas (`mode: insensitive`).

## Decisión

`lib/accent-search.ts` calcula los ids que coinciden con SQL crudo parametrizado y los controladores filtran con `id IN (...)`. Las tablas y columnas buscables son una lista cerrada (no vienen del usuario).

## Alternativas consideradas

- Extensión `unaccent` de Postgres: más limpia, pero exige permisos para crearla y una migración.
- Columnas normalizadas guardadas aparte: duplica datos y hay que mantenerlas.
- Filtrar en memoria: no escala.

## Consecuencias

+ Sin migración ni extensión; los permisos y la paginación siguen siendo de Prisma.
- Recorre la tabla (sin índice) en cada búsqueda; correcto con miles de filas, a revisar con cientos de miles.
- Tope de 1000 coincidencias por búsqueda (20 000 en la bitácora); más allá, el resultado se trunca en silencio.
- No cubre los nomencladores (países, ciudades, nacionalidades).
