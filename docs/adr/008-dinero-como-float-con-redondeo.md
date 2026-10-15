# ADR 008: Importes guardados como `Float` con redondeo por moneda

Estado: Aceptada con deuda técnica

## Contexto

Se maneja peso chileno (sin decimales) y dólar (dos decimales).

## Decisión

Los importes del esquema son `Float`; `utils/money.ts` redondea al número de decimales de cada moneda antes de guardar o mostrar.

## Alternativas consideradas

- `Decimal` de Prisma o enteros en unidades menores: representación exacta, pero obliga a convertir en todo el código y en el cliente.

## Consecuencias

+ Simple y suficiente con importes pequeños y redondeo disciplinado.
- **Riesgo real:** los flotantes acumulan error en sumas largas y comparaciones de igualdad (por ejemplo, si un pago cubre exactamente el total). Está mitigado por el redondeo, no eliminado.
- Es la deuda de precisión más visible del modelo. Recomendación: migrar a `Decimal` antes de que haya volumen o contabilidad real encima.
