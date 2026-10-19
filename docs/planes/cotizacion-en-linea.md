# Plan: cotización en línea con seguimiento

**Estado:** propuesto, pendiente de 5 decisiones (del dueño y del gerente). No hay nada implementado.
**Fecha:** 2026-10-19

## Para qué sirve
Desde el ADR 020 el agente envía la cotización por correo con un mensaje editable y el PDF adjunto.
Después de enviarla no se sabe nada: no hay envío programado, copia (CC) ni seguimiento de si el cliente
la abrió o respondió. La propuesta es enviar un **enlace único** a una página pública de la cotización
(por ejemplo `/c/<código>`) y registrar cuándo se abre.

- **Para el cliente:** ve la cotización bien presentada, sin cuenta ni contraseña. Puede descargar el PDF
  y escribir al agente desde la misma página.
- **Para la agencia:** la cotización muestra «Enviada → Vista hace 2 h (3 veces)», llega un aviso al agente
  y se puede filtrar las cotizaciones enviadas hace días que nadie ha abierto.
- Además el adjunto pasa a ser opcional, lo que evita que algunos filtros de spam retengan el correo.

## Qué hay hoy (lectura del código, 2026-10-18)
- Rutas públicas sin sesión (documentos legales): el patrón existe en API y cliente.
- Campana de notificaciones internas.
- Tareas programadas dentro del API (`node-cron`, `src/jobs`).
- PDF y correo editable de la cotización (PR #93 del API y #69 del cliente, ADR 020).
- `FRONTEND_URL` ya existe en `src/config/env.ts` y se usa para los enlaces de restablecer contraseña.
  Hay que comprobar que en producción apunte a la dirección pública real de la demo.

## Diseño

### Enlace
- Código aleatorio de 256 bits. En la base se guarda **solo su hash**, no el código: una fuga de la base
  no expone enlaces utilizables.
- Tabla nueva, aditiva, con **un enlace por cada envío**. Campos previstos: cotización, hash, fecha de
  creación, vencimiento, revocado, primera vista, última vista y número de visitas.
- Se puede revocar y regenerar desde la vista del agente.

### Página pública
- Muestra solo lo que corresponde al cliente: servicios, totales, descuento, vigencia, notas y términos.
- Nada interno: sin RUT, sin datos bancarios, sin identificadores.
- Un código desconocido, vencido o revocado responde **siempre el mismo 404**, sin distinguir el motivo.
- Lleva `noindex`, no envía referer y tiene su propio límite de peticiones.

### Seguimiento y sus límites reales
El sistema no debe prometer más de lo que sabe.
- Antivirus, Outlook y los previsualizadores de WhatsApp pueden «abrir» enlaces automáticamente. Para
  reducir falsos positivos, la vista se cuenta solo cuando la página se carga completa en un navegador,
  ignorando bots conocidos.
- «Vista» no significa «leída». Si el cliente reenvía el enlace no se sabe quién lo abrió.
- **No** se usa el píxel invisible en el correo: es poco fiable porque Apple y Gmail lo precargan.

### Privacidad
- Se guarda lo mínimo: fechas, número de visitas y tipo de dispositivo, **sin IP**.
- Chile tiene una nueva ley de datos personales que entra en vigor a fines de 2026. Antes de vender esto
  conviene que un abogado revise la política de privacidad y la forma de avisar al cliente de que se
  registra la apertura del enlace.

## Las otras limitaciones y cómo se superan
| Limitación | Solución propuesta |
|---|---|
| Sin copia (CC) ni copia oculta | Campos CC y BCC en el envío. Es lo más sencillo. |
| Las respuestas no llegan al agente | Fijar «Responder a» con el correo del agente que envía. |
| No se sabe si el cliente respondió | Sin conectar una casilla de entrada no se puede. Dentro del sistema: botón «Tengo una consulta» en la página pública, que crea una tarea y una notificación para el agente. |
| Sin envío programado | Guardar el envío con fecha y hora; una tarea cada pocos minutos envía los pendientes. Al depender de la base de datos, un reinicio del API no pierde nada. Se puede cancelar mientras esté pendiente. |
| Sin recordatorios | El más útil y menos arriesgado es interno: «lleva 3 días enviada sin abrir». Recordar al cliente automáticamente es posible, pero puede molestar. |
| Sin rebotes ni entrega | Requiere un proveedor de correo con avisos (Resend, Postmark). Se deja para una etapa posterior. |

## Fases
Una rama y un PR por fase, API antes que cliente, como hasta ahora.

1. **API, enlace y página pública.** Tabla, generación y hash, lectura pública, registro de visitas y filtro
   de bots. Pruebas de vencimiento, revocación, 404 uniforme, límite de peticiones y de que la respuesta no
   filtre nada interno.
2. **API, integración con el envío.** Cada envío crea su enlace, el correo lleva el botón «Ver cotización en
   línea» y el PDF adjunto pasa a ser opcional.
3. **Cliente, página pública.** Responsiva, con la marca de la agencia, descarga del PDF y «Tengo una consulta».
4. **Cliente, vista del agente.** Estado de lectura en la lista y el detalle, avisos en la campana, copiar,
   revocar o regenerar el enlace y filtro «enviadas sin abrir».
5. **CC, copia oculta y «Responder a».** Pequeño; puede ir en paralelo.
6. **Envío programado y recordatorios internos.**
7. **Aceptación en línea** (según la decisión 1), si la quieren.
8. **Verificación.** Suites completas, pasada en navegador (escritorio y móvil, incluido abrir el enlace como
   cliente) y prueba en producción.

**Recomendación:** hacer las fases 1 a 4 primero, con la 5 en paralelo. Es el núcleo de lo pedido y ya da
valor por sí solo.

## Decisiones pendientes
| # | Pregunta | Propuesta |
|---|---|---|
| 1 | Aceptar en línea: ¿el botón «Aceptar» marca la cotización como aceptada, o solo avisa al agente para que la confirme? | Solo avisar. Marcarla sola habilita los pagos. |
| 2 | Vencimiento del enlace: ¿hasta la vigencia de la cotización o unos 30 días más? | Por decidir. |
| 3 | PDF adjunto: ¿se sigue adjuntando junto al enlace o solo va el enlace? | Por decidir; configurable por envío sería lo flexible. |
| 4 | Avisos de «abrió la cotización»: ¿solo quien la creó o también el gerente? | Por decidir. |
| 5 | Recordar al cliente: ¿solo recordatorios internos o también correos automáticos al cliente? | Solo internos. |

Si falta alguna respuesta se usa la propuesta y se registra en un ADR, como en el plan de margen.

## Riesgos y cosas a vigilar
- Falsos positivos de apertura por bots y previsualizadores (mitigado, no eliminado).
- Fuga de información interna en la respuesta pública: se cubre con una prueba que compara la respuesta
  contra una lista cerrada de campos.
- Cumplimiento de la ley chilena de datos personales: requiere revisión legal, no es solo técnico.
- Esquema: la tabla nueva es aditiva, sin tocar datos existentes; la migración no debe bloquear el despliegue.
