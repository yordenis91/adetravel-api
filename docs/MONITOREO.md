# Monitoreo externo de Adetravel

Última revisión: 15 de octubre de 2026. Complementa [`../OPERATIONS.md`](../OPERATIONS.md) (alertas y runbook) y [`CALIDAD.md`](CALIDAD.md) (fase 7).

## 1. Qué se vigila y con qué

| Qué | Cómo | Quién avisa | Qué detecta |
|---|---|---|---|
| API viva y con base de datos | Monitor HTTP a `/api/health` cada 3 minutos | Better Stack, por correo | API caída, base de datos caída, proxy roto |
| Web (cliente) viva | Monitor HTTP a la URL de la web | Better Stack, por correo | Cliente caído o certificado vencido |
| Respaldo nocturno del VPS | Latido (*heartbeat*): el script lo envía al terminar | Better Stack, por correo | Respaldo que **no se ejecutó** (cron caído, servidor apagado) o que terminó con errores |
| Errores de la aplicación | Sentry (API y cliente) | Sentry | Excepciones no controladas, con datos personales filtrados |
| Disco del servidor | Trabajo `diskSpace` del API (cada 30 min) | Correo a `ALERT_EMAIL` | Menos del 15 % libre (`DISK_ALERT_MIN_FREE_PERCENT`) |
| Respaldo fallido | Script del VPS | Correo a `ALERT_EMAIL` del script | Cualquier error durante el respaldo |

Por qué dos mecanismos para el respaldo: el correo avisa cuando el script **falla**, pero si el script nunca arranca no envía nada. El latido cubre ese caso: si pasa el plazo sin recibirlo, el monitor avisa por su cuenta.

## 2. URLs de producción

| Servicio | URL |
|---|---|
| API (salud) | `https://deploy-adetravel2-api.wgteoi.easypanel.host/api/health` (200 y `{"data":{"status":"ok"}}`) |
| Web | `https://adetravel.demo.yordeniscorreoso.com` |

`/api/health` hace `SELECT 1` contra la base y está fuera del límite de peticiones, así que sondearlo cada pocos minutos no consume cupo ni provoca falsas alarmas.

## 3. Configuración en Better Stack (plan gratuito)

Según fuentes de terceros, el plan gratuito incluye 10 monitores y 10 latidos, comprobación cada 3 minutos, una página de estado y alertas por correo. Confirmar los límites vigentes al registrarse.

1. Crear la cuenta en Better Stack (producto *Uptime*).
2. **Monitor de la API:** *Monitors → Create monitor*.
   - Tipo: HTTP(S) / *Keyword*. URL: la de salud de la API.
   - Palabra a buscar: `"status":"ok"` (así se detecta una respuesta 200 con contenido incorrecto).
   - Frecuencia: 3 minutos. Alertas: correo.
3. **Monitor de la web:** igual, URL de la web, esperar código 200.
4. **Latido del respaldo:** *Heartbeats → Create heartbeat*.
   - Nombre: `Respaldo VPS (adetravel y otras bases)`.
   - Periodo: 1 día. Gracia: 3 horas (el respaldo corre a las 03:30 y tarda unos minutos).
   - Copiar la URL del latido.
5. **En el servidor:** añadir a `/etc/backup-vps.conf` la línea `HEARTBEAT_URL="<url del latido>"`. El script ya la usa: llama a la URL al terminar bien y a `<url>/fail` si hay errores. Sin la variable, no hace nada.
6. **Prueba:** ejecutar `sudo /usr/local/bin/backup-dbs.sh --local` (no sube a Drive) y comprobar que el latido pasa a «Up». Después probar la alerta: apagar el monitor de prueba o esperar un plazo sin latido.

## 4. Variables del API que activan avisos propios

| Variable | Efecto si falta |
|---|---|
| `ALERT_EMAIL` | Las alertas de disco bajo y de respaldo fallido del API no se envían. |
| `SENTRY_DSN` | Sin errores en Sentry. **Definido en producción** (comprobado el 15 de octubre de 2026). |
| `BACKUP_HEARTBEAT_URL` | El trabajo de respaldo propio del API no emite latido. No es necesario mientras el respaldo oficial sea el del VPS. |

Con `EMAIL_DELIVERY=redirect` (como está hoy), el correo de las alertas del API llega a `EMAIL_REDIRECT_TO`, no a `ALERT_EMAIL`.

## 5. Estado (16 de octubre de 2026)

- **Hecho y comprobado en el servidor:**
  - `SENTRY_DSN` definido en el API y presente en el paquete del cliente.
  - `ALERT_EMAIL` definido en el contenedor del API en marcha.
  - La URL de salud y la web responden 200 desde fuera.
  - `HEARTBEAT_URL` configurada en `/etc/backup-vps.conf` (permisos 600). Una ejecución real del script (`--local`) envió primero `/fail` (por el error de la incidencia de abajo) y, ya corregido, el latido de éxito.
- **Hecho según indica quien administra la cuenta, no verificable desde el servidor:** monitores HTTP de la API y de la web en Better Stack, y el latido del respaldo creado.
- **Pendiente:**
  - Confirmar en el panel de Better Stack que el latido figura como «Up» y que los dos monitores HTTP están en verde.
  - Comprobar en el panel de Sentry que llegan eventos.
  - Primera ejecución nocturna real (03:30, con subida a Drive) con el latido activo: revisar `.last_ok` y el panel al día siguiente.

## 6. Incidencia encontrada al probar el latido (16 de octubre de 2026)

Al ejecutar el respaldo a mano, el volcado de `vortex` falló. El script elegía el contenedor con el filtro `name=^deploy_vortex-db`, que también coincide con `deploy_vortex-db_pgweb` (la interfaz web de la base), y tomaba el primero que Docker listaba. Había funcionado hasta entonces solo por el orden de los contenedores; `yws` tenía el mismo riesgo con `deploy_yws-db_dbgate`.

Corrección: el filtro exige el punto que Swarm añade tras el nombre del servicio (`name=^deploy_vortex-db\.`), de modo que cada prefijo resuelve a un único contenedor. Tras el arreglo, las cuatro bases (adetravel, vortex, yws y typebot) se vuelcan y cifran sin errores.

Sin esta prueba, el respaldo de esa noche habría fallado para `vortex`. El correo de fallo lo habría avisado, pero es un ejemplo de por qué conviene el latido además del aviso: ambos se ejercitaron en esta prueba.
