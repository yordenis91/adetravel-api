# ADR 001: Dos piezas separadas: API REST y cliente web (SPA)

Estado: Aceptada

## Contexto

El sistema lo usa solo el personal de la agencia hoy, pero se prevé una aplicación móvil y, más adelante, una página para que los clientes vean su viaje.

## Decisión

Un API REST (Express + Prisma) y un cliente React que se sirve como archivos estáticos con nginx. Se despliegan por separado y se hablan por JSON con JWT.

## Alternativas consideradas

- Aplicación única con render en servidor (Next.js u otra): menos piezas, pero acopla la interfaz al servidor y complica una app móvil.
- Monolito con plantillas: descartado por la experiencia de usuario requerida (tablas, diálogos, vista previa de PDF).

## Consecuencias

+ Una app móvil o un portal de clientes reutilizan el mismo API sin rehacer nada.
+ Se pueden desplegar y escalar por separado.
- Dos repos y dos pipelines que mantener, y hay que cuidar la compatibilidad entre ambos (hoy no hay pruebas de contrato entre ellos).
- La seguridad real debe estar siempre en el API: el cliente solo oculta lo que el usuario no puede usar.
