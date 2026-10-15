# ADR 015: Tasas de cambio sincronizadas desde un servicio externo, con intervalo y enfriamiento

Estado: Aceptada

## Contexto

El dueño cotiza en varias monedas y no debe buscar la tasa a mano.

## Decisión

Un *tick* cada 5 minutos decide si toca sincronizar según el intervalo configurable (por defecto cada 8 horas; mínimo 15 minutos). Tras un fallo se reintenta como pronto a los 30 minutos; el botón manual tiene un enfriamiento de la mitad del intervalo. Cada intento se registra para mostrarlo en pantalla.

## Alternativas consideradas

- Tasas solo manuales: error humano y trabajo diario.
- Consultar en cada cotización: dependencia en línea de un tercero.

## Consecuencias

+ Resiliente a caídas del proveedor; el último valor sigue usándose.
- Depende de una clave de API y de un tercero; sin clave, la sincronización se omite y la pantalla lo muestra como no actualizada.
