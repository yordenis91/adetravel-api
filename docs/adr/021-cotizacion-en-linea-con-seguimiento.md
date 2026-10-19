# ADR 021: Cotización en línea con enlace público y seguimiento

Estado: Aceptada (precisa el ADR 020)

## Contexto

Tras el ADR 020 el cliente recibe un PDF adjunto y el sistema no sabe nada más: ni si lo abrió, ni si quiere aceptar, ni si tiene dudas. El agente se entera por casualidad o no se entera. Además faltaban copia (CC y oculta), «Responder a», envío programado y recordatorios. Plan y análisis: `docs/planes/cotizacion-en-linea.md`.

## Decisión

**Enlace público `/c/<código>`**
- Tablas nuevas y aditivas: `quotation_links` (un enlace por cotización, reutilizado en los reenvíos), `quotation_link_events` (línea de tiempo: VIEW, DOWNLOAD, ACCEPT_REQUEST, QUESTION, RENEW_REQUEST; **sin IP**) y `scheduled_quotation_sends`.
- El código **no se guarda**: es `<id sin guiones><HMAC-SHA256 del id, base64url>` (75 caracteres, 256 bits de firma). Se eligió esto en lugar de guardar un hash (lo previsto en el plan) para que el agente pueda volver a copiar el enlace cuando quiera sin regenerarlo; una fuga de la base sigue sin entregar enlaces, porque la clave vive en el entorno (`QUOTATION_LINK_SECRET`, o `JWT_SECRET` si falta). Rotar esa clave invalida los enlaces ya enviados.
- Un código falso, mal formado, desconocido, revocado, vencido o de una cotización en Borrador responde **siempre el mismo 404**.
- **Vencimiento:** el enlace muere 30 días después de la vigencia de la cotización (mínimo 7 días desde que se envía; 60 si no tiene vigencia). Entre medias, una cotización vencida muestra «vencida», sin precios, con un botón para pedir actualización: ahí hay una venta recuperable, no un error.
- La página solo muestra lo del cliente: sin RUT, correos, ids ni datos bancarios; cabeceras `no-store`, `noindex` y `no-referrer`; límite de peticiones propio por IP (lectura, PDF y escritura).

**Seguimiento honesto**
- Una apertura cuenta solo si la página se carga en un navegador (la llamada la hace la aplicación, no un rastreador) y se ignoran bots, antivirus y previsualizadores por *user-agent*, y al personal con sesión iniciada. «Vista» no es «leída».
- Visita nueva = pasaron más de 30 min desde la última actividad; se reclama de forma atómica en la base (ráfagas y refrescos no inflan el contador).
- No se usa píxel de seguimiento (Apple y Gmail lo precargan).

**Aceptar en línea solo avisa**
- «Quiero aceptar» **no cambia el estado** (aceptar habilita los pagos): crea una tarea para el agente, avisa por la campana y por correo al agente **y al gerente**, y el agente confirma con el cambio de estado de siempre. Consultas: tarea y aviso al agente (máximo 5 mensajes por día y enlace). Pedir renovar una cotización vencida avisa también al gerente.
- Quién recibe qué: el **agente** (quien envió la cotización) recibe todo; el **gerente** solo lo que mueve ventas o dinero (aceptación pedida, renovación de una vencida). Las aperturas avisan solo al agente: la primera vez y, si vuelven, solo pasadas 24 h.

**Envío**
- `POST /quotations/:id/send` acepta `cc`, `bcc`, `attachPdf` e `includeLink` (al menos uno de los dos), y `scheduledAt` (futuro, hasta 90 días). «Responder a» es el correo de quien envía. En modo `redirect` (demo) todo va a la casilla de pruebas y CC/CCO se omiten.
- El envío programado vive en la base y lo despacha un trabajo cada minuto: reclamo atómico, recuperación de los que quedaron «en proceso» tras una caída, 3 intentos para fallos pasajeros y fallo inmediato (con aviso a quien lo programó) cuando ya no se puede enviar (aceptada, cancelada, vencida). Se puede cancelar mientras esté pendiente.
- Recordatorios **internos** diarios (9:15) al agente: «3 días enviada sin abrir» y «vence en 2 días sin aceptarse». No se escribe al cliente de forma automática.
- Lista y detalle de cotizaciones traen `tracking` (aperturas, última vista, aceptación pedida) y la lista admite `?tracking=unopened|viewed|acceptance`.

## Consecuencias

- Hay que configurar `FRONTEND_URL` con la dirección pública real del cliente: de ahí salen los enlaces.
- Los falsos positivos de apertura se reducen, no se eliminan; reenviar el enlace no permite saber quién lo abre.
- Privacidad: se registran fechas, número de visitas y tipo de dispositivo. Antes de ofrecer esto a terceros conviene que un abogado revise la política de privacidad y el aviso al cliente de que se registra la apertura (nueva ley chilena de datos personales a fines de 2026).
- Rebotes y entregas del correo siguen sin conocerse (requiere un proveedor con avisos, p. ej. Resend o Postmark).
- El trabajo de envíos programados corre en cada réplica con `JOBS_ENABLED=true`; el reclamo atómico evita duplicados, pero conviene dejar una sola (ver OPERATIONS.md).
