# ADR 002: PostgreSQL con Prisma 7 y el adaptador `pg`

Estado: Aceptada

## Contexto

Datos fuertemente relacionales (clientes, solicitudes, servicios, cotizaciones, pagos) y necesidad de migraciones versionadas y tipos en TypeScript.

## Decisión

PostgreSQL como única base; Prisma como ORM y herramienta de migraciones (`prisma migrate deploy` al arrancar el contenedor). Para consultas que Prisma no expresa (búsqueda sin tildes) se usa SQL crudo parametrizado.

## Alternativas consideradas

- Otro ORM (TypeORM, Drizzle) o SQL directo: más control, menos seguridad de tipos y más trabajo en migraciones.
- Una base documental: no encaja con integridad referencial y reportes.

## Consecuencias

+ Tipos generados desde el esquema, migraciones reproducibles, e2e contra un Postgres real en CI.
+ Las extensiones de Prisma permitieron el cifrado transparente (ADR 004).
- Aplicar migraciones al arrancar acopla el despliegue al estado de la base; una migración fallida deja el contenedor en bucle (hay runbook en `OPERATIONS.md`, apartado P3009).
- Con varias réplicas, todas intentarían migrar; hoy se corre con una.
