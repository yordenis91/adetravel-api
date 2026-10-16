# ADR 017: Contrato API-cliente como instantánea versionada, con copia en el cliente

Estado: Aceptada

## Contexto

API y cliente se despliegan por separado (ADR 001) y hasta ahora nada vigilaba que siguieran siendo compatibles. El cliente consume las respuestas como `any` en cientos de sitios, así que `tsc` no detecta un campo renombrado. Sus tipos de entidad (`src/types/api.ts`) no los importaba ningún archivo, y estaban desfasados (`full_name`, `created_at`, roles que no existen). Además el cliente duplica listas de valores del API: los 17 estados del flujo y sus transiciones, los tipos de servicio y los permisos.

## Decisión

El API guarda `contracts/api-contract.json`, una instantánea de:

- **Respuestas:** la forma (campos y tipos JSON) de 19 respuestas clave: inicio de sesión, perfil, y los listados y detalles de clientes, solicitudes, servicios, cotizaciones, confirmaciones, pagos, vouchers, proveedores, usuarios, tareas, notificaciones, bitácora, búsqueda y datos de la agencia. Los campos de contenido libre (`details`, `items`, `metadata`) se documentan sin entrar en ellos.
- **Listas de valores:** estados del flujo y transiciones, tipos de servicio, roles, estados y métodos de pago, estados de cotización y voucher, y permisos.

El test `__tests__/api-contract.e2e.test.ts` siembra datos, pide esas respuestas al API real y compara con la instantánea. Si algo cambia, falla con la lista de lo que cambió. Un cambio intencionado se acepta con:

```
UPDATE_CONTRACT=1 npm run test:e2e
```

y el diff del archivo aparece en el pull request para revisarlo.

El cliente guarda una copia del contrato y comprueba en su CI (a) que sus constantes duplicadas coinciden con las listas de valores, y (b) que su copia sigue siendo igual a la del API en `main`.

## Alternativas consideradas

- **Tipos generados desde el API y usados en el cliente:** no protege, porque el cliente no usa tipos de entidad (consume `any`); habría que reescribir cientos de usos.
- **OpenAPI generado desde esquemas zod:** más completo, pero obliga a describir cada ruta y mantener otro formato; desproporcionado para un equipo de una persona.
- **Pruebas de contrato dirigidas por el consumidor (Pact):** la herramienta estándar, pero añade un broker y dependencias para dos repos.

## Consecuencias

+ Un cambio de forma en el API ya no pasa inadvertido: rompe el CI del API hasta que se acepte, y rompe el del cliente hasta que sincronice.
+ La prueba ya destapó un defecto real: el inicio de sesión devolvía `tokenVersion` y el hash de un enlace pendiente (corregido en el PR #86).
- Solo verifica la forma de las respuestas con los datos de la muestra. No comprueba que el cliente use bien cada campo, ni los campos opcionales que la muestra no rellena.
- Es una instantánea, no una especificación: un campo nuevo también falla hasta aceptarlo, lo cual es deliberado pero añade un paso.
- La comprobación de sincronización del cliente lee el contrato de `main` del API por red; si no hay conexión, avisa y se omite en vez de fallar.
