# ADR 004: Cifrado AES-256-GCM de datos personales mediante extensiones de Prisma

Estado: Aceptada

## Contexto

Pasaporte, cuenta bancaria, titular y RUT son datos sensibles; un volcado de la base no debe revelarlos. Además esos datos se copian dentro del JSON de cada servicio.

## Decisión

`client-pii-extension` y `service-pii-extension` cifran al escribir y descifran al leer (`query` y `result` de `$extends`). Formato `v1:iv:tag:ciphertext`, clave en `PII_ENCRYPTION_KEY`. Hay scripts de cifrado retroactivo y de rotación de clave, probados.

## Alternativas consideradas

- Cifrado de columna en Postgres (pgcrypto): obliga a mover la lógica a SQL y a manejar la clave en la base.
- Cifrado de disco solamente: no protege frente a un volcado ni a un acceso a la base.
- Cifrar en cada controlador: se olvida fácilmente en endpoints nuevos.

## Consecuencias

+ Transparente para el resto del código; no se puede olvidar en un endpoint nuevo.
+ Registros antiguos en texto plano se siguen leyendo hasta correr el cifrado retroactivo.
- No se puede buscar ni ordenar por esos campos (ya no se busca por pasaporte).
- **Perder la clave es perder los datos.** El respaldo no incluye la clave; debe guardarse aparte (pendiente: copia de la clave del respaldo en un gestor de contraseñas).
- Hay que mantener la lista de campos cifrados en tres sitios (extensión, script de rotación, script de cifrado retroactivo).
