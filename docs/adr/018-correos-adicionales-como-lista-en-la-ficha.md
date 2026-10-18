# ADR 018: Correos adicionales de clientes y proveedores como lista en la propia ficha

Estado: Aceptada

## Contexto

Un cliente o proveedor tenía un solo correo principal (el proveedor, además, uno de ejecutivo y otro operativo, con su propia función). En la práctica una agencia escribe a varias direcciones por cliente (la persona, su pareja, contabilidad) y por proveedor (reservas, pagos, gerencia), y no tenía dónde guardarlas.

## Decisión

Se añade `additionalEmails String[] @default([])` a `clients` y a `providers`: una lista de correos **además** de los que ya existen, que se mantienen sin cambios.

- **Validación** (`src/validators/email-list.ts`, la misma para ambos): se limpian espacios, se descartan filas vacías y repetidos (sin distinguir mayúsculas; queda el primero), cada correo debe ser válido y hay un máximo de 10. Las filas vacías no cuentan para el máximo, porque el formulario las puede enviar.
- **Edición:** al crear, si no se envía, queda `[]`. Al editar (PATCH), si no se envía **no se toca**; para quitar todos se envía `[]`. Así editar otro campo nunca borra los correos.
- **Migración aditiva** (`20261018120000_correos_adicionales`): dos columnas con valor por defecto; las filas existentes quedan con `[]`. No hay que rellenar datos ni existe riesgo para el código anterior.
- **Contrato:** el campo entra en `contracts/api-contract.json` (ADR 017) y el cliente copia el contrato antes de usarlo.

## Consecuencias

- Es la forma más simple posible: sin tabla nueva ni uniones, y se devuelve en el detalle y en los listados sin más consultas.
- Los correos adicionales **no tienen etiqueta ni función** (no se sabe cuál es "pagos"): solo son direcciones. Si algún día hace falta (por ejemplo, enviar las cotizaciones a "contabilidad"), habría que pasar a una tabla con tipo; la migración desde esta lista sería sencilla.
- **Los correos adicionales no participan en la unicidad** del correo principal (un cliente nuevo puede usar como principal un correo que otro tiene como adicional) y **todavía no son buscables** en las búsquedas de clientes y proveedores.
- **No se usan para enviar correo automático.** Los avisos y las invitaciones siguen yendo al correo principal; los adicionales son, por ahora, datos de contacto que el equipo ve y usa con el enlace `mailto:`.

## Alternativas consideradas

- **Tabla `contact_emails` con tipo y principal:** es más flexible, pero obliga a joins, a migrar los correos actuales y a una pantalla de gestión; desproporcionado mientras solo se necesite guardar y mostrar direcciones.
- **Un campo de texto con correos separados por comas:** sin validación ni forma de editar uno por uno, y con problemas de duplicados.
