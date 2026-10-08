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

El **primer** despliegue con una migración que falla muestra `Error: P3018` (con el error de
Postgres, p. ej. `division by zero`). A partir de ahí, cada reintento falla con:

```
Error: P3009
The `X_migration_name` migration started but failed.
```

**Ojo: Prisma no ejecuta cada migración dentro de una transacción.** Si falla a mitad, lo que se
ejecutó antes del error **queda aplicado** (ensayado: la tabla y la columna creadas antes del fallo
seguían ahí). Por eso las migraciones nuevas de este repo van envueltas en `BEGIN; … COMMIT;`: con
eso Postgres lo deshace todo y el caso se reduce a "no se aplicó nada". No usar `BEGIN/COMMIT` si la
migración lleva `CREATE INDEX CONCURRENTLY` (no admite transacción).

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

**Comprobación final:** tras recuperar, `npx prisma migrate diff --from-config-datasource
--to-schema prisma/schema.prisma --exit-code` debe salir con código 0 (esquema y base idénticos).

**Ensayo registrado (2026-10-07, copia de una base sembrada):**

1. Migración de prueba que crea una tabla, añade una columna y luego falla (`SELECT 1/0`).
   Primer despliegue: `P3018`; reintento: `P3009`. En `_prisma_migrations` quedó con
   `finished_at` y `rolled_back_at` en `NULL`, y la tabla y la columna **sí existían**.
2. Se revirtieron a mano (`DROP TABLE`, `DROP COLUMN`), `migrate resolve --rolled-back`, se corrigió
   el `.sql` y el despliegue siguiente la aplicó; el tercero no tuvo nada pendiente. Sin pérdida de
   datos.
3. La misma migración envuelta en `BEGIN/COMMIT`: al fallar no quedó nada aplicado; bastó con
   `resolve --rolled-back` y corregirla.

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

### Ensayo de restauración automatizado (`npm run restore:drill`)

Comprueba de punta a punta que el último backup sirve, sin tocar la base real:

1. Descarga el dump más reciente de `BACKUP_S3_BUCKET` (avisa si tiene más de 26 h).
2. Lo restaura en `adetravel_restore_test`, una base desechable dentro del contenedor local de
   Postgres `adtv-dev-pg` (`npm run test:e2e` lo crea).
3. Verifica migraciones (y que no haya ninguna a medias), filas por tabla, que exista un
   administrador activo y que **cada** campo de PII cifrado se descifre con `PII_ENCRYPTION_KEY`.
   Si la contraseña SMTP está guardada, comprueba también que se descifra.
4. Borra la base restaurada (`KEEP_RESTORE_DB=1` para conservarla) y el archivo descargado.

Nunca imprime datos, solo conteos. Sale con código 1 si algo falla.

Credenciales en `.env.restore` en la raíz del repo (ignorado por git; las variables del entorno
tienen prioridad sobre el archivo):

```bash
BACKUP_S3_ENDPOINT=...
BACKUP_S3_BUCKET=...
BACKUP_S3_ACCESS_KEY_ID=...
BACKUP_S3_SECRET_ACCESS_KEY=...
PII_ENCRYPTION_KEY=...   # la de Vaultwarden vigente cuando se hizo el backup
```

**Frecuencia recomendada:** una vez al mes y siempre después de rotar `PII_ENCRYPTION_KEY`.

**Dónde está la clave:** `PII_ENCRYPTION_KEY` se guarda en el Vaultwarden del administrador
(confirmado el 2026-10-07). La API corre con una sola réplica en Easypanel, así que los trabajos
programados (avisos y backup) no se duplican.

**Ensayo registrado (2026-10-07, en local):** backup real de la app (`runDatabaseBackupJob` desde la
imagen Docker) de una base sembrada a un MinIO local → `npm run restore:drill`: 8 migraciones, filas
idénticas a la base de origen, 30 de 30 campos de PII descifrados; con una clave distinta, 0 de 30 y
`FALLA`; la API arrancó sobre la base restaurada, inició sesión y devolvió los 10 clientes con el
pasaporte legible. Falta repetirlo contra el bucket real de la demo.

### Qué NO cubre esto (para una vuelta futura)

- **No hay cifrado adicional del dump en sí** más allá de lo que el bucket
  S3 ofrezca (TLS en tránsito siempre; cifrado en reposo depende de cómo
  esté configurado el bucket/MinIO). El dump de un cliente con muchos datos
  personales (nombre, email, teléfono) igual conviene tratarlo como
  sensible aunque el pasaporte/cuenta bancaria ya vengan cifrados.
- **No hay verificación periódica automática de que el backup restaura bien** (sí hay un ensayo manual, `npm run restore:drill`, arriba) —
  hoy es un procedimiento manual (la sección de arriba). Una mejora futura
  razonable es un job separado que periódicamente restaure el último
  backup a una base descartable y falle ruidosamente si no puede.
- **El cron corre dentro del mismo contenedor de la API**, no en un
  servicio separado. Si el contenedor está caído en el momento exacto del
  cron, esa corrida se salta (vuelve a correr al día siguiente). Aceptable
  para un backup diario, pero vale tenerlo presente.

## Alertas

Fase 4 de preproducción. Qué avisa, por qué canal y qué hacer.

| Alerta | Cuándo salta | Canal | Qué hacer |
|---|---|---|---|
| `BACKUP_FAILED` | Cada vez que el backup programado falla | Log `error`, Sentry (`alert:BACKUP_FAILED`), correo a `ALERT_EMAIL` y `<BACKUP_HEARTBEAT_URL>/fail` | Ver el mensaje (credenciales S3, bucket, `pg_dump`) y lanzar un backup manual cuando esté resuelto |
| Backup que no corre | El servicio externo del heartbeat no recibe el ping del día | Lo avisa ese servicio (healthchecks.io u otro) | El contenedor estuvo caído a la hora del cron, `JOBS_ENABLED=false` en la única réplica o faltan las variables `BACKUP_S3_*` |
| `DISK_LOW` | Espacio libre del disco del servidor por debajo de `DISK_ALERT_MIN_FREE_PERCENT` (15 %); se comprueba cada 30 min y se repite como mucho cada 6 h | Log `error`, Sentry (`alert:DISK_LOW`) y correo a `ALERT_EMAIL` | `df -h /` en el servidor; liberar caché de build (`docker builder prune`) e imágenes sin uso **antes** del siguiente despliegue: con el disco lleno falla `prisma migrate deploy` (incidente del 2026-10-07) |
| Aplicación caída | `/api/health` deja de responder 200 (la API no arranca o la base no responde) | Monitor externo (ver abajo) | Logs del servicio en Easypanel; si es una migración fallida, la sección P3009 de este documento |

**Cómo se ve el disco desde la API:** el contenedor usa `overlay` sobre el mismo disco del servidor, así
que `statfs("/")` dentro del contenedor da las cifras del servidor (comprobado: `df -h /` dentro y fuera
de un contenedor dan el mismo tamaño y uso).

**Aplicación caída: necesita un monitor externo.** Una aplicación caída no puede avisar de sí misma, y el
`HEALTHCHECK` del Dockerfile solo reinicia el contenedor. Hace falta un servicio que consulte
`https://<api>/api/health` cada 1-5 minutos desde fuera del servidor y avise por correo, por ejemplo
UptimeRobot, Better Stack o healthchecks.io. `/api/health` devuelve 200 solo si la base responde a `SELECT 1` y no consume el límite de peticiones. Conviene vigilar también la URL
del cliente. Crear la cuenta del monitor es tarea del administrador.

**Correo de las alertas:** pasa por `sendEmail`, así que respeta `EMAIL_DELIVERY` (con `redirect` llega a
`EMAIL_REDIRECT_TO`; con `off` solo queda en el log y en Sentry). Si el SMTP es lo que falla, el aviso
llega igualmente por Sentry y por el heartbeat.

## Réplicas y trabajos programados

Los trabajos programados (avisos de atraso a las 9:00, backup diario, alerta de disco y actualización de tasas de cambio) corren **dentro
del proceso de la API**. Con una réplica no hay problema. Con más de una, cada réplica los ejecutaría:
avisos y backups duplicados. Por eso existe `JOBS_ENABLED`:

- **Una réplica (configuración actual):** `JOBS_ENABLED=true` (valor por defecto).
- **Varias réplicas:** dejar `JOBS_ENABLED=true` en una sola y `false` en el resto. En Easypanel esto
  supone un segundo servicio con la misma imagen y `JOBS_ENABLED=false` para las réplicas de tráfico.
  También sirve un servicio aparte solo para los trabajos.

### Tasas de cambio automáticas

Un trabajo despierta cada 5 minutos y sincroniza con la API de divisas cuando corresponde según
Configuración > Divisas: por defecto 3 veces al día (480 min); el intervalo es editable (15 min a 7 días)
y se puede apagar. Requiere `CURRENCY_API_KEY`; sin ella no hace nada. Con un plan de pago de la API,
basta acortar el intervalo desde la pantalla, sin tocar variables ni redesplegar. El último intento y el
último error se ven en esa misma pestaña. Cada sincronización queda en el registro de actividad.

## Lista de comprobación de salida

Antes de abrir producción (fase 5), con `.env.example` como referencia de todas las variables:

- [ ] `NODE_ENV=production`, `DATABASE_URL` de la base de producción y `FRONTEND_URL` con la URL pública del cliente.
- [ ] `JWT_SECRET` nuevo, aleatorio y de 32 caracteres o más, distinto del de la demo. El arranque avisa si es débil.
- [ ] `PII_ENCRYPTION_KEY` nueva, de 64 caracteres hex, guardada **también fuera del servidor**. Sin ella los backups no sirven para los datos cifrados.
- [ ] `EMAIL_DELIVERY=live` solo en producción; en la demo, `redirect` con `EMAIL_REDIRECT_TO`.
- [ ] SMTP configurado (variables o Configuración > Correo) y un correo de prueba recibido.
- [ ] `ALLOW_PUBLIC_REGISTRATION=false`; los usuarios entran por invitación.
- [ ] `ALLOW_PARTIAL_PAYMENTS` y `BLOCK_EXPIRED_QUOTATIONS` confirmados con la agencia.
- [ ] Las 4 variables `BACKUP_S3_*` con un bucket propio; un backup ejecutado y un `npm run restore:drill` correcto contra ese bucket.
- [ ] `ALERT_EMAIL` y `BACKUP_HEARTBEAT_URL` configurados, y un fallo provocado del heartbeat recibido.
- [ ] Monitor externo de `/api/health` (y de la URL del cliente) creado, con aviso por correo.
- [ ] `SENTRY_DSN` (API) y `VITE_SENTRY_DSN` (cliente) con `SENTRY_ENVIRONMENT=production`.
- [ ] `JOBS_ENABLED=true` en una sola réplica.
- [ ] `CURRENCY_API_KEY` si se usan las tasas de cambio.
- [ ] Ninguna variable de solo scripts (`ADMIN_PASSWORD`, `PII_ENCRYPTION_KEY_OLD/NEW`) queda cargada en el servicio.
- [ ] Al menos un 15 % de disco libre (`df -h /`) antes del primer despliegue.
