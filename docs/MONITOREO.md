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

- **Hecho:** `SENTRY_DSN` definido en el API y presente en el paquete del cliente; la URL de salud y la web responden 200 desde fuera; el script de respaldo del VPS ya sabe enviar el latido (probado en local, opcional); creados en Better Stack los monitores HTTP de la API y de la web (según indica quien administra la cuenta; no verificable desde el servidor).
- **Pendiente:**
  - `ALERT_EMAIL` está definido en Easypanel pero **el contenedor del API en marcha no lo tiene todavía**: hay que reiniciar o redesplegar el servicio para que lo aplique. Comprobar después con `printenv ALERT_EMAIL` dentro del contenedor.
  - Crear el latido del respaldo en Better Stack y pegar su URL en `/etc/backup-vps.conf` como `HEARTBEAT_URL`. Hasta entonces, si el respaldo dejara de ejecutarse solo se sabría por la ausencia del correo de fallo, que no cubre ese caso.
  - Comprobar en el panel de Sentry que llegan eventos.
