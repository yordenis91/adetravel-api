# ADR 003: Flujo de 17 estados como tabla de transiciones explícita

Estado: Aceptada

## Contexto

El negocio define un proceso largo (de la solicitud al voucher) con reglas distintas para solicitudes de servicios sueltos y para paquetes. El estado debe ser fiable y auditable.

## Decisión

Una única lista de estados y un mapa de transiciones válidas en `validators/workflow-status.ts`; la lógica de propagación (de servicios a solicitud, de solicitud a servicios) en `services/workflow.service.ts`. Las acciones de otros módulos (cotizar, confirmar, pagar) avanzan el flujo y nunca lo retroceden.

## Alternativas consideradas

- Estados libres con validación dispersa: más simple al inicio, imposible de razonar y de probar.
- Una librería de máquinas de estado: añade dependencia para un grafo pequeño y estable.

## Consecuencias

+ Se prueba como datos y como funciones puras; el comportamiento es predecible.
+ Los cambios de proceso se hacen en un solo sitio.
- Los estados están duplicados en el cliente (`lib/workflow-status.ts`); un cambio exige tocar ambos repos.
- El documento de requisitos y el diagrama no coinciden del todo (16 estados frente a 17); se resolvió añadiendo el 17.º y quedó anotado en el código.
