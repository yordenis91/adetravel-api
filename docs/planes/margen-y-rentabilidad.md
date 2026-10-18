# Plan: margen y rentabilidad por viaje

**Estado:** propuesto, pendiente de las respuestas del gerente de la agencia. No hay nada implementado.
**Fecha:** 2026-10-18

## Para qué sirve
Hoy el sistema registra lo que se vende y lo que se cobra, pero no cuánto gana la agencia en cada viaje.
Las Estadísticas muestran la recaudación y conteos por estado, no la ganancia. Saber el margen por viaje,
por agente, por proveedor y por tipo de servicio es la pregunta que más pesa en una agencia.

## Qué hay hoy (lectura del código, 2026-10-18)
- **Venta:** `Quotation` guarda subtotal, descuento, IVA (19 % por defecto) y total.
- **Costo:** `Confirmation.price` es lo que cobra el proveedor, por solicitud o por servicio.
  No tiene moneda propia. Su `exchangeRate` es opcional y no tiene una semántica definida.
- **Cobro:** `Payment` guarda monto y moneda; el estado COMPLETADO cuenta como cobrado.
- **Informe actual:** `GET /reports` suma solo los pagos COMPLETADO en CLP.
- **Moneda base:** `defaultCurrency` (CLP) y tasas de cambio que se actualizan solas.

## Regla propuesta
Margen de una solicitud = **venta neta** − **costo**, todo convertido a CLP.
- Venta neta = cotización aceptada, sin IVA y con el descuento aplicado. El IVA no es ingreso de la agencia.
- Costo = suma de las confirmaciones del proveedor de esa solicitud.
- Margen % = margen / venta neta.

Salidas seguras:
- Sin confirmaciones aún: se muestra "sin costo registrado", no un margen del 100 %.
- Falta la tasa de una moneda: se marca "margen incompleto"; no se inventa el valor.
- Solicitudes canceladas: fuera del cálculo.

## Decisiones pendientes del gerente
1. **Moneda del costo.** Propuesta: añadir `currency` a la confirmación (CLP por defecto; las existentes quedan en CLP).
   Pregunta: ¿los proveedores cobran a veces en USD o EUR?
2. **Qué cuenta como costo.** Propuesta: todas las confirmaciones de la solicitud.
   Pregunta: ¿hay otros costos (comisión de tarjeta, fee de plataforma, comisión de agentes)?
3. **IVA.** Propuesta: margen sobre venta neta, sin IVA.
   Pregunta: ¿es la regla de la agencia? ¿Algunos servicios están exentos?
4. **Quién ve el margen.** Propuesta: permiso nuevo `VIEW_MARGINS`, solo Gerente y Finanzas.
   Pregunta: ¿también Operaciones? ¿Los agentes ven el margen de sus propias ventas?
5. **Margen bajo.** Pregunta: ¿qué porcentaje consideran preocupante, para activar la alerta? (Propuesta inicial: 10 %.)

Si alguna respuesta no está disponible, se usa la propuesta y se documenta en un ADR para poder cambiarla.

## Fases
Una rama y un PR por fase. Cada una se prueba antes de pasar a la siguiente.

1. **API: cálculo puro.** Función aislada, sin base de datos, con pruebas de casos límite:
   conversión de moneda, descuento, IVA, sin costo, cancelada, paquete frente a servicio suelto, redondeo.
2. **API: datos y endpoints.** Migración aditiva (`Confirmation.currency`), permiso `VIEW_MARGINS`,
   `GET /requests/:id/profitability`, `GET /reports/profitability` (por período, agente, proveedor y tipo de servicio),
   contrato, pruebas e2e y ADR.
3. **Cliente: captura del costo.** Moneda en la confirmación; en la cotización, costo y margen visibles solo con permiso.
4. **Cliente: rentabilidad a la vista.** Tarjeta en el detalle de la solicitud, sección en Estadísticas
   (margen total, por agente, proveedor y tipo de servicio, y viajes menos rentables) e indicador en el Panel.
5. **Verificación.** Suites completas, pasada en navegador con datos de prueba (cifras contra un cálculo manual,
   rol sin permiso sin acceso al margen), despliegue y prueba en producción.

## Riesgos
- **Cifras erróneas:** en un informe de dinero es el mayor riesgo; por eso la fase 1 es pura y se prueba a fondo.
- **Filtración a roles de ventas:** el API valida el permiso, no solo el cliente, y se prueba con e2e.
- **Histórico:** las confirmaciones existentes quedan en CLP y no se modifican.

## Fuera de alcance
Comisiones de agentes, costos no ligados a un proveedor y contabilidad. Podrían ser una fase posterior.
