# Decisiones de negocio pendientes

Reglas que se implementaron con un **supuesto** porque el dueño de la agencia no estaba disponible
para confirmarlas. Cada una tiene un interruptor de configuración (variable de entorno) para cambiarla
sin tocar código. Cuando el dueño decida, se cambia la variable en Easypanel, se reinicia el backend y
se borra o actualiza la fila de esta tabla.

| # | Decisión | Supuesto actual | Variable | Valor actual | Dónde se aplica |
|---|----------|-----------------|----------|--------------|-----------------|
| 1 | ¿Se aceptan pagos parciales (abonos)? | **No.** Cada pago es por el total de una cotización aceptada. | `ALLOW_PARTIAL_PAYMENTS` | `false` | `src/services/payment-rules.ts`, `src/controllers/payments.controller.ts` |
| 2 | ¿Se puede enviar o aceptar una cotización vencida? | **No.** Hay que renovar la fecha de validez editándola en Borrador. | `BLOCK_EXPIRED_QUOTATIONS` | `true` | `src/controllers/quotations.controller.ts` (`changeQuotationStatus`) |

Estado de ambas: **asumidas, sin confirmar** (registrado el 2026-10-07).

## 1. Pagos parciales

Con `ALLOW_PARTIAL_PAYMENTS=false` (hoy):

- Un pago debe estar asociado a una cotización **aceptada** y su monto debe ser exactamente el total
  (`PARTIAL_PAYMENT_NOT_ALLOWED`). Si no se indica la cotización, se usa la única aceptada de la
  solicitud en esa moneda; con varias hay que indicarla (`QUOTATION_REQUIRED`), y sin ninguna no se
  puede cobrar todavía (`NO_ACCEPTED_QUOTATION`).
- Una cotización admite un solo pago pendiente o completado (`PAYMENT_ALREADY_EXISTS`).
- Al completarse el pago, la solicitud pasa a `PAGADO_POR_CLIENTE`.

Con `ALLOW_PARTIAL_PAYMENTS=true`:

- El monto puede ser cualquier valor positivo y puede haber varios pagos por cotización.
- La solicitud solo pasa a `PAGADO_POR_CLIENTE` cuando los pagos **completados** cubren el total de
  las cotizaciones aceptadas, moneda por moneda (`src/services/payment-coverage.ts`). Un anticipo queda
  registrado sin dar la venta por pagada.

Para activarlo: `ALLOW_PARTIAL_PAYMENTS=true` y reiniciar. Pendiente aparte si se activa: que el frontend
muestre el saldo por cobrar de cada cotización.

## 2. Cotizaciones vencidas

Con `BLOCK_EXPIRED_QUOTATIONS=true` (hoy), pasar a `ENVIADA` o `ACEPTADA` una cotización cuya fecha de
validez ya pasó responde 409 `QUOTATION_EXPIRED`. La fecha se compara con la de Chile
(`America/Santiago`). Rechazar siempre está permitido. Con `false` no se valida la vigencia.

## Decisiones confirmadas por el administrador (2026-10-08)

| Decisión | Comportamiento | Dónde |
|---|---|---|
| ¿Se puede cobrar antes de que el proveedor confirme? | **Sí.** Completar el pago lleva la solicitud a `PAGADO_POR_CLIENTE` aunque esté en `ACEPTADA_POR_CLIENTE`. | `changePaymentStatus` |
| ¿Qué pasa al revertir un pago completado? | Si la solicitud estaba en `PAGADO_POR_CLIENTE` y deja de estar cubierta, vuelve a `ENVIADA_SOLICITUD_PAGO_CLIENTE` (y sus servicios en `PAGADO_POR_CLIENTE` también). Si ya avanzó más (pago al proveedor, voucher…), no se toca. | `changePaymentStatus`, `revertPaidRequest` |
| ¿Se puede emitir un voucher antes de pagar al proveedor? | **No.** Emitirlo exige la solicitud en `PAGADO_AL_PROVEEDOR` o más adelante (409 `VOUCHER_TOO_EARLY`) y la lleva a `VOUCHER_EMITIDO`. | `changeVoucherStatus` |

## Otras decisiones abiertas (sin supuesto implementado)

- **IVA por defecto:** el esquema de cotización usa 0 si no se envía el campo y la configuración de la
  agencia tiene 19. Falta definir cuál manda y que el frontend lo envíe.
- **Varias cotizaciones por solicitud:** al aceptar una no se rechazan las demás.
- **Cotización aceptada:** hoy no se puede deshacer.
- **Sesiones:** no se invalidan los tokens al cambiar la contraseña (requiere una migración).
