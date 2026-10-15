# Registro de decisiones de arquitectura (ADR)

Cada decisión sigue el mismo formato: contexto, decisión, alternativas consideradas y consecuencias (lo bueno y lo que se sacrifica). Las marcadas «con deuda» o «con riesgo» son los puntos que conviene atender primero. Visión general en [`../ARQUITECTURA.md`](../ARQUITECTURA.md).

| ADR | Decisión | Estado |
|---|---|---|
| 001 | [Dos piezas separadas: API REST y cliente web (SPA)](001-dos-piezas-api-y-spa.md) | Aceptada |
| 002 | [PostgreSQL con Prisma 7 y el adaptador `pg`](002-prisma-y-postgresql.md) | Aceptada |
| 003 | [Flujo de 17 estados como tabla de transiciones explícita](003-maquina-de-estados-explicita.md) | Aceptada |
| 004 | [Cifrado AES-256-GCM de datos personales mediante extensiones de Prisma](004-cifrado-de-datos-personales-en-prisma.md) | Aceptada |
| 005 | [Sesiones con JWT, `jti` y versión de token, con revocación en base de datos](005-jwt-con-revocacion-en-base.md) | Aceptada |
| 006 | [Permisos por módulo con roles y excepciones por usuario](006-permisos-por-modulo-con-excepciones.md) | Aceptada |
| 007 | [Búsqueda que ignora tildes con `translate()` y `lower()` en SQL](007-busqueda-sin-tildes-en-sql.md) | Aceptada |
| 008 | [Importes guardados como `Float` con redondeo por moneda](008-dinero-como-float-con-redondeo.md) | Aceptada con deuda técnica |
| 009 | [Números correlativos por mes calculados como «máximo + 1»](009-numeracion-correlativa-por-maximo.md) | Aceptada con riesgo conocido |
| 010 | [`system_config` como tabla de una sola fila con orden estable](010-configuracion-de-una-sola-fila.md) | Aceptada |
| 011 | [Reglas de negocio no confirmadas, implementadas con interruptores por variable de entorno](011-reglas-asumidas-con-interruptores.md) | Aceptada (provisional) |
| 012 | [Respaldos de todas las bases del VPS, cifrados, hacia Google Drive](012-respaldos-cifrados-fuera-del-servidor.md) | Aceptada |
| 013 | [Despliegue en Easypanel disparado por el CI](013-despliegue-por-easypanel-tras-ci.md) | Aceptada |
| 014 | [Correo saliente con modos `live`, `redirect` y `off`](014-correo-con-modos-de-entrega.md) | Aceptada |
| 015 | [Tasas de cambio sincronizadas desde un servicio externo, con intervalo y enfriamiento](015-tasas-de-cambio-sincronizadas.md) | Aceptada |
