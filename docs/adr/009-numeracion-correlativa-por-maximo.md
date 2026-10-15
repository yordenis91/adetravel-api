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
- Dos creaciones simultáneas en el mismo mes pueden calcular el mismo número: una falla por la restricción única y el manejador de errores responde conflicto (no hay reintento automático). No lo he visto ocurrir, y con el uso previsto es improbable, pero no hay prueba de concurrencia que lo demuestre.
