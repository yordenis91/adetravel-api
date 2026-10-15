# ADR 011: Reglas de negocio no confirmadas, implementadas con interruptores por variable de entorno

Estado: Aceptada (provisional)

## Contexto

El dueño no estaba disponible para decidir si se aceptan pagos parciales ni si se puede enviar una cotización vencida.

## Decisión

Se implementó un supuesto (sin pagos parciales; cotización vencida bloquea) detrás de `ALLOW_PARTIAL_PAYMENTS` y `BLOCK_EXPIRED_QUOTATIONS`, y se registró en `DECISIONES_PENDIENTES.md` con dónde se aplica cada una.

## Alternativas consideradas

- Esperar la decisión: bloquea el avance.
- Implementar solo una variante: obliga a reescribir si la decisión cambia.

## Consecuencias

+ Cambiar la regla es cambiar una variable y reiniciar.
- Cada interruptor duplica las ramas a probar; con pagos parciales activados faltan cambios en el cliente (saldo por cobrar).
