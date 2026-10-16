# ADR 016: Dos copias de seguridad con roles distintos; la oficial para desastres es la del VPS

Estado: Aceptada (precisa el ADR 012)

## Contexto

Conviven dos mecanismos de respaldo, y ambos están activos (comprobado el 16 de octubre de 2026):

| | Trabajo `backupDatabase` del API | Script `backup-dbs.sh` del VPS |
|---|---|---|
| Qué copia | Solo la base de Adetravel | Las 4 bases Postgres del servidor (adetravel, vortex, yws, typebot) |
| Cuándo | Cada día a las 03:00 | Cada día a las 03:30 |
| Destino | Bucket `adetravel-backups` en un MinIO de Easypanel **del mismo servidor** | Google Drive (fuera del servidor) |
| Cifrado del archivo | No (los campos sensibles ya van cifrados dentro de la base, ADR 004) | Sí, con clave propia |
| Retención | 30 días (`BACKUP_RETENTION_DAYS`) | 7 diarias, 4 semanales y 6 mensuales |
| Monitoreo | Alerta por correo si falla (`ALERT_EMAIL`); sin latido externo | Alerta por correo, más latido en Better Stack |
| Estado | 19 copias en el bucket; la última, la del 15 de octubre | Funcionando; restauración probada |

## Decisión

Los dos se mantienen, con papeles distintos:

- **Recuperación ante desastres (oficial): el script del VPS.** Es la única copia fuera del servidor, cifrada y vigilada por un latido externo. Si el servidor se pierde, es la que se restaura.
- **Recuperación rápida: el trabajo del API.** Cubre el error humano o la corrupción de datos (por ejemplo, un borrado accidental ayer) con una copia reciente y a mano, sin salir del servidor.

El trabajo del API **no cuenta** como protección frente a la pérdida del servidor, y no se presenta como tal.

## Alternativas consideradas

- Apagar el del API: se pierde la copia rápida y específica de la aplicación; el único coste de mantenerla es un archivo de unos 130 KB al día.
- Apuntar el del API a un destino externo: duplicaría el del VPS y exigiría otro servicio o credenciales fuera del servidor.
- Dejar solo el del VPS y mejorarlo: razonable, pero hoy el del API ya funciona y no cuesta nada.

## Consecuencias

+ Dos capas con objetivos claros: error humano (minutos) y desastre (horas).
+ Ninguna es punto único de fallo: si falla una, la otra sigue.
- El archivo del API **no va cifrado** y vive en el mismo servidor y la misma cuenta de administración que la base. No debe tratarse como copia externa.
- El del API no tiene latido externo: si dejara de ejecutarse, solo avisaría si el trabajo falla, no si no arranca. Se puede añadir con `BACKUP_HEARTBEAT_URL` y un segundo latido en Better Stack.
- Hay que mantener dos procedimientos de restauración. El del VPS está en `development/backup-vps/PROCEDIMIENTO.md`; el del API, en `OPERATIONS.md`.
