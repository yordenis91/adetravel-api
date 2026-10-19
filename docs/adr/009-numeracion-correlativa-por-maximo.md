# ADR 009: Números correlativos por mes calculados como «máximo + 1»

Estado: Aceptada con riesgo conocido

## Contexto

Solicitudes, cotizaciones, pagos, vouchers, servicios y confirmaciones llevan números legibles (`COTIZ-2026-10-0011`).

## Decisión

`numbering.service.ts` busca el mayor correlativo ya usado con ese prefijo y suma uno. La unicidad la garantiza una restricción única en la base. Reemplazó a «cantidad + 1», que repetía números al borrar registros.

## Alternativas consideradas

- Secuencias de Postgres: sin colisiones, pero no se reinician por mes ni por prefijo sin trabajo extra.
- Tabla de contadores con bloqueo: robusta, con más código.

## Consecuencias

+ Legible, con reinicio mensual, sin tablas extra.
- Dos creaciones simultáneas en el mismo mes pueden calcular el mismo número: una choca con la restricción única. **Cotizaciones** ya reintenta con un número nuevo (hasta 6 veces) y tiene una prueba de concurrencia; el CI lo hizo visible el 19 de octubre de 2026 al crear muchas cotizaciones en paralelo. Las demás entidades (solicitudes, pagos, vouchers, servicios, confirmaciones) siguen sin reintento: la manejadora de errores responde conflicto (409) y hay que volver a intentar.
