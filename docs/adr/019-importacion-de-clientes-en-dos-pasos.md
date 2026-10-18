# ADR 019: Importación de clientes en dos pasos (vista previa y confirmación), sin pisar existentes

Estado: Aceptada

## Contexto

Una agencia que adopta el sistema ya tiene su cartera en Excel. Teclear cientos de clientes a mano es la mayor barrera de entrada, y una importación mal hecha (duplicados, filas rotas, datos pisados) es peor que no tenerla.

## Decisión

- El **navegador** lee el archivo (.xlsx o .csv) y envía las filas ya convertidas a `POST /clients/import` (máximo 500 por envío). El API no recibe archivos: no hay carga de ficheros ni analizadores de formatos en el servidor.
- El endpoint tiene dos modos con la misma lógica: `dryRun: true` valida y detecta duplicados **sin guardar** (vista previa) y `dryRun: false` guarda. La regla de validación es una sola, la de `createClientSchema`, la misma del alta manual.
- **Cada fila se valida por separado**: una fila mala no tumba el archivo; se devuelve el motivo por fila.
- **Duplicados**: por RUT (sin puntos, guion ni mayúsculas) o por correo (sin distinguir mayúsculas), contra la base y dentro del mismo archivo. Se omiten; **nunca se actualiza un cliente existente**.
- Las filas válidas se guardan en una sola operación (`createMany`), con `createdBy` del usuario; los campos ajenos al cliente (`id`, `createdAt`…) se descartan. Queda **una entrada** en la bitácora, no una por fila.
- Permiso: `CREATE_CLIENT`, el mismo del alta manual.

## Consecuencias

- Importar el mismo archivo dos veces es seguro: la segunda vez todo sale como duplicado.
- Quien quiera actualizar clientes existentes desde Excel no puede hacerlo aún (decisión consciente; sería otro modo con su propio riesgo).
- Los duplicados sin RUT ni correo no se pueden detectar: dos filas con el mismo nombre se importan ambas.
- 500 filas por envío: un archivo mayor se divide en varios.
