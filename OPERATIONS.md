# Operación en Easypanel: arranque, apagado y migraciones

Este documento explica cómo el contenedor del backend arranca y se apaga en
producción, y qué hacer si una migración queda a medio aplicar. Existe
porque en el pasado un reinicio prematuro del contenedor durante
`prisma migrate deploy` dejó una migración marcada como fallida (error
**P3009**), y el contenedor entró en bucle de reinicio sin forma fácil de
entrar a arreglarlo — el "fix" de esa vez fue cambiar el `CMD` del
Dockerfile a un servidor HTTP inofensivo solo para poder abrir una terminal.
Las secciones de abajo son las mejoras hechas para que eso no vuelva a pasar
y, si pasa, se pueda resolver en minutos sin tocar el Dockerfile.

## Qué se arregló

1. **`/health` ya no comparte el rate limit con el resto de la API.**
   Antes, el endpoint de salud estaba registrado *después* del middleware
   de `express-rate-limit` (100 req/15min por defecto). El polling
   periódico de Easypanel contra `/health` contaba contra ese límite, así
   que en cualquier ventana con tráfico normal el propio health check
   podía empezar a responder `429` — Easypanel lo lee como "contenedor
   caído" y reinicia el contenedor sin que hubiera ningún problema real.
   Ahora las rutas de salud se registran antes del limiter.

2. **`/health` valida la base de datos de verdad.** Antes devolvía
   `{status: "ok"}` sin importar nada; ahora hace un `SELECT 1` contra
   Postgres y responde `503` si la base no contesta, para que Easypanel
   pueda detectar (y reiniciar) un contenedor realmente roto.

3. **Apagado ordenado (`SIGTERM`/`SIGINT`).** El servidor ahora deja de
   aceptar conexiones nuevas, cierra la conexión de Prisma y recién
   entonces termina el proceso, con un tope de 10s antes de forzar la
   salida. Antes el proceso no manejaba estas señales, así que un
   redeploy podía cortar en seco una request a medio procesar.

4. **`tini` como PID 1 del contenedor** (ver `Dockerfile`). `npm` no
   reenvía señales de forma confiable a los procesos que lanza, así que
   sin un init real, un `SIGTERM` de Docker puede tardar en llegarle al
   proceso de verdad (`npx prisma migrate deploy` o `node dist/server.js`).
   Si eso pasa, Docker se cansa de esperar y manda `SIGKILL` — y si el
   `SIGKILL` llega a mitad de una migración, esa migración queda marcada
   como fallida en `_prisma_migrations`, que es exactamente el origen del
   incidente P3009 anterior. `tini` reenvía la señal de inmediato.

5. **`uncaughtException`/`unhandledRejection` ahora terminan el proceso**
   (reportando a Sentry antes). Seguir corriendo después de un error no
   manejado es lo que Node.js mismo desaconseja: el proceso puede quedar
   en un estado roto pero "vivo", y como el health check viejo siempre
   decía "ok", nada lo reiniciaba nunca. Ahora se deja morir al proceso
   para que Easypanel levante uno limpio.

6. **`HEALTHCHECK` en el Dockerfile**, con `start-period=45s` para dar
   tiempo a que corran las migraciones antes de que Docker empiece a
   contar fallos.

## Cómo recuperarse de una migración fallida (P3009)

Si un deploy falla con algo como:

```
Error: P3009
The `X_migration_name` migration started but failed.
```

Seguir este runbook (ya no hace falta tocar el `CMD` del Dockerfile):

1. **No reintentar el deploy todavía** — va a volver a fallar con el mismo
   P3009 mientras la migración siga marcada como fallida en la tabla
   `_prisma_migrations`.
2. Abrir una terminal al contenedor desde Easypanel (o conectarse
   directamente a la base de Postgres con las credenciales de `DATABASE_URL`).
3. Revisar si el DDL de esa migración realmente se aplicó o no —
   `SELECT * FROM "_prisma_migrations" WHERE migration_name = '<nombre>';`
   y comparar contra el `.sql` de la migración en `prisma/migrations/`.
4. Marcar la migración según corresponda:
   - Si el DDL sí quedó aplicado en la base:
     `npx prisma migrate resolve --applied <nombre_de_la_migracion>`
   - Si el DDL NO se aplicó (o se aplicó a medias y hubo que revertirlo a mano):
     `npx prisma migrate resolve --rolled-back <nombre_de_la_migracion>`
5. Volver a disparar el deploy normal (`npx prisma migrate deploy` corre
   automáticamente al arrancar el contenedor).

**Importante:** el paso 4 es una decisión que depende del estado real de la
base — no automatizar esto a ciegas. Marcar `--applied` una migración que
en realidad no corrió (o viceversa) puede dejar el esquema desincronizado
de forma silenciosa.
