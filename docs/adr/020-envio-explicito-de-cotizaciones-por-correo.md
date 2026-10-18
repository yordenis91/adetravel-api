# ADR 020: Envío explícito de cotizaciones por correo, con mensaje editable

Estado: Aceptada

## Contexto

Al pasar una cotización a "Enviada" el sistema mandaba solo un correo fijo, sin que nadie lo viera. Problemas reales:

- La persona no podía ver ni editar el mensaje, ni elegir a quién (los correos adicionales del cliente, ADR 018, se ignoraban).
- Si el correo no estaba configurado o el envío estaba desactivado, la cotización quedaba "Enviada" igual: se creía enviada y el cliente no recibía nada.
- Los correos con plantilla salían con los marcadores sin rellenar (`{{client_name}}`): ningún llamador pasaba las variables.
- El PDF omitía el descuento (subtotal + IVA no sumaba el total), la vigencia y los términos y condiciones, y mostraba la fecha de impresión en vez de la de la cotización.

## Decisión

- `GET /quotations/:id/email-draft`: devuelve destinatarios posibles (principal y adicionales), asunto y mensaje iniciales y el modo de entrega del entorno. No envía nada.
- `POST /quotations/:id/send` (permiso `MANAGE_QUOTATIONS`): envía el PDF adjunto con el asunto y el mensaje **que la persona editó**, a los destinatarios que eligió (1 a 10, cualquier correo válido; el asunto no admite saltos de línea).
  - Solo desde Borrador o Enviada. Respeta solicitud cancelada y vigencia vencida.
  - **El estado cambia solo si el correo salió.** Sin PDF, con SMTP caído, sin SMTP configurado o con el envío desactivado, responde error claro y no cambia nada. Desde Enviada es un reenvío.
  - El mensaje se escapa como texto: lo escrito nunca se interpreta como HTML.
  - Queda una entrada en la bitácora con las direcciones enmascaradas.
- El mensaje editable es texto plano propio del correo; la plantilla HTML "Cotización enviada" sigue usándose para el correo automático del cambio de estado, y su asunto prellena el del borrador.
- `PATCH /quotations/:id/status` acepta `sendEmail: false` para marcar como enviada sin correo (p. ej. se envió por WhatsApp). Por defecto sigue enviando el correo automático.
- `sendEmail` devuelve si salió (`sent`) y por qué no; `sendTemplateEmail` rellena las variables (reemplazo seguro con `$` y valores escapados en el HTML) y las cotizaciones ahora las pasan.
- El PDF y la vista previa muestran descuento, vigencia, términos y condiciones y la fecha de la cotización.

## Consecuencias

- No hay envío programado, copia (CC) ni respuesta registrada: el sistema no sabe si el cliente abrió o respondió.
- Los demás correos con plantilla (pagos, vouchers, solicitudes) siguen sin pasar variables; es un hallazgo abierto en `docs/CALIDAD.md`.
- Cualquier usuario con `MANAGE_QUOTATIONS` puede enviar a cualquier dirección válida (hasta 10 por envío): queda registrado en la bitácora, pero no hay límite de frecuencia propio más allá del general.
