# ADR 012: Respaldos de todas las bases del VPS, cifrados, hacia Google Drive

Estado: Aceptada

## Contexto

La demo comparte VPS con otras aplicaciones; un fallo del disco o del servidor perdería todo. El respaldo propio del API (hacia S3) solo cubre su base y exige un bucket.

## Decisión

Un script del VPS (`backup-dbs.sh`, cron 03:30) vuelca cada base Postgres, la cifra con una clave propia y la sube a Google Drive con rclone (alcance `drive.file`), con retención y alerta por correo si falla. Hay procedimiento de restauración documentado y probado.

## Alternativas consideradas

- Solo el trabajo del API hacia S3: no cubre las otras bases ni existe aún un bucket.
- Instantáneas del proveedor: rápidas, pero dentro del mismo proveedor.

## Consecuencias

+ Copia fuera del servidor y cifrada; restauración probada.
- Dos mecanismos conviven (el del API es opcional y está apagado si faltan variables); conviene decidir cuál es el oficial.
- La clave de cifrado del respaldo está solo en el servidor hasta guardarla en un gestor de contraseñas.
- El Drive usado tiene 15 GiB, suficiente hoy.
