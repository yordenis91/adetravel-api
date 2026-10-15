# ADR 005: Sesiones con JWT, `jti` y versión de token, con revocación en base de datos

Estado: Aceptada

## Contexto

Se necesita cerrar sesión de verdad, invalidar sesiones al cambiar la contraseña, y que eso sobreviva a los despliegues (antes la lista de revocados vivía en memoria).

## Decisión

Cada token lleva `jti` y la `tokenVersion` del usuario. Cambiar o restablecer la contraseña incrementa la versión; el cierre de sesión guarda el `jti` en `revoked_tokens` hasta que caduca. Se mantiene una lista en memoria solo para tokens antiguos sin `jti`.

## Alternativas consideradas

- Sesiones de servidor con cookie: revocación trivial, pero exige almacén de sesiones compartido y complica una futura app móvil.
- JWT sin revocación: más simple, pero un token robado vale hasta caducar.

## Consecuencias

+ Sin estado en el servidor salvo la lista de revocados.
- Cada petición autenticada consulta la base (usuario y revocación); es un coste aceptado a esta escala.
- El token vive 7 días por defecto, se guarda en `localStorage` del navegador (expuesto si hubiera un fallo de XSS) y no hay *refresh token*: al caducar hay que volver a iniciar sesión.
