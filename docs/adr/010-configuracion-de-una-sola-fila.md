# ADR 010: `system_config` como tabla de una sola fila con orden estable

Estado: Aceptada

## Contexto

Datos de la agencia, SMTP, tasas de cambio y textos legales son únicos para toda la instalación.

## Decisión

Una tabla de una fila leída con `findFirst()`. Una extensión de Prisma fija que, sin orden explícito, gane la fila más antigua. Apareció una fila sobrante en la demo; se eliminó con respaldo.

## Alternativas consideradas

- Clave-valor: más flexible, pierde tipos.
- Restricción en la base que impida una segunda fila: más fuerte, requiere migración.

## Consecuencias

+ Simple y tipada; la extensión protege frente a duplicados.
- No impide que se cree una segunda fila; solo hace el resultado determinista.
