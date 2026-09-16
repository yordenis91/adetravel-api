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

## Backups y recuperación ante desastres

### Cómo funciona

Un cron interno (`node-cron`, ver `src/jobs/backupDatabase.job.ts`) corre
`pg_dump --format=custom` contra `DATABASE_URL` y sube el resultado a un
bucket S3-compatible (MinIO en Easypanel, u otro). Se registra solo si
están configuradas las 4 variables `BACKUP_S3_*` requeridas — si falta
alguna, el servidor arranca igual pero loguea una advertencia y no programa
el cron (no es un error fatal).

**Variables de entorno** (configurar como secretos en Easypanel, nunca en
el repo — `.env*` ya está en `.gitignore`):

| Variable | Requerida | Descripción |
|---|---|---|
| `BACKUP_S3_ENDPOINT` | Sí (para habilitar backups) | URL del endpoint S3-compatible, ej. `https://mi-minio.easypanel.host` |
| `BACKUP_S3_BUCKET` | Sí | Bucket destino. **Usar un bucket dedicado a este proyecto**, no uno compartido con otra app — así un compromiso de credenciales en un lado no expone los backups del otro. |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | Sí | Credenciales del bucket. Si reusás las mismas credenciales de otro proyecto, dales acceso restringido solo a este bucket (policy de IAM/MinIO), no a nivel de cuenta completa. |
| `BACKUP_S3_REGION` | No (default `us-east-1`) | La mayoría de los S3-compatibles no-AWS ignoran el valor real, pero el SDK lo exige. |
| `BACKUP_CRON` | No (default `0 3 * * *`, 3am diario) | Expresión cron estándar de 5 campos. |
| `BACKUP_RETENTION_DAYS` | No (default `30`) | Backups más viejos que esto se borran del bucket automáticamente en cada corrida. |

El objeto sube con key `adetravel-db/<timestamp ISO>.dump` — formato
`pg_dump --format=custom`, que es el que espera `pg_restore` (no es SQL
plano). Está probado localmente (dump real + restore a una base de prueba)
antes de mandar este cambio a producción.

### ⚠️ La clave de cifrado de PII no está en este backup

El pasaporte y la cuenta bancaria de Cliente están cifrados con
`PII_ENCRYPTION_KEY` (ver [`PII_ENCRYPTION.md`](./PII_ENCRYPTION.md)). El
dump de la base contiene esos campos **cifrados**, tal cual están en
Postgres — recuperar la base sin la clave deja esos campos permanentemente
ilegibles, sin importar cuán reciente sea el backup.

`PII_ENCRYPTION_KEY` **no se sube a este bucket junto con los dumps** — a
propósito, para no guardar la clave y el texto cifrado en el mismo lugar
(si el bucket se compromete, un atacante tendría ambos). Guardala en un
gestor de secretos separado (1Password, Bitwarden, Vault, etc.), documentá
desde qué fecha está vigente cada valor, y confirmá que quien tenga que
restaurar un backup en el futuro sepa dónde encontrarla.

### Cómo restaurar un backup

**Nunca restaures directo contra producción para "probar".** Siempre a una
base de prueba primero.

1. Descargar el dump del bucket (con el cliente S3 que prefieras — `aws
   s3 cp --endpoint-url <BACKUP_S3_ENDPOINT> s3://<bucket>/<key> ./backup.dump`,
   o la consola web de MinIO).
2. Crear una base de prueba y restaurar ahí primero:
   ```bash
   createdb -h localhost -U <usuario> adetravel_restore_test
   pg_restore --clean --if-exists \
     --dbname="postgresql://<usuario>:<password>@localhost:5432/adetravel_restore_test" \
     ./backup.dump
   ```
   (`--clean --if-exists` evita el warning inofensivo de "schema public
   already exists" al restaurar sobre una base que ya tiene el schema
   `public` por defecto.)
3. Verificar que las tablas y datos esperados estén ahí (`\dt` en `psql`,
   algún `SELECT count(*)` de una tabla conocida).
4. Recién ahí, si hace falta restaurar producción de verdad: coordinar una
   ventana de mantenimiento, apagar el backend (evitar escrituras durante
   la restauración), y correr el mismo `pg_restore --clean --if-exists`
   contra la base real.
5. Si la restauración incluye clientes con PII cifrada, confirmar que
   `PII_ENCRYPTION_KEY` en el entorno de destino es la misma que estaba
   vigente cuando se generó ese backup (ver advertencia arriba).

### Qué NO cubre esto (para una vuelta futura)

- **No hay cifrado adicional del dump en sí** más allá de lo que el bucket
  S3 ofrezca (TLS en tránsito siempre; cifrado en reposo depende de cómo
  esté configurado el bucket/MinIO). El dump de un cliente con muchos datos
  personales (nombre, email, teléfono) igual conviene tratarlo como
  sensible aunque el pasaporte/cuenta bancaria ya vengan cifrados.
- **No hay verificación automática de que el backup restaura bien** —
  hoy es un procedimiento manual (la sección de arriba). Una mejora futura
  razonable es un job separado que periódicamente restaure el último
  backup a una base descartable y falle ruidosamente si no puede.
- **El cron corre dentro del mismo contenedor de la API**, no en un
  servicio separado. Si el contenedor está caído en el momento exacto del
  cron, esa corrida se salta (vuelve a correr al día siguiente). Aceptable
  para un backup diario, pero vale tenerlo presente.
