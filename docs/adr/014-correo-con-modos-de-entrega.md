# ADR 014: Correo saliente con modos `live`, `redirect` y `off`

Estado: Aceptada

## Contexto

La demo usa datos que podrían parecerse a los de clientes reales; ningún correo de prueba debe llegar a un cliente.

## Decisión

`EMAIL_DELIVERY` decide: `live` envía al destinatario, `redirect` lo envía a `EMAIL_REDIRECT_TO` con el destino original en el asunto, `off` no envía. La contraseña SMTP se guarda cifrada en `system_config`.

## Alternativas consideradas

- Un servicio transaccional (SES, SendGrid): mejor entregabilidad y métricas, con coste y alta de cuenta.

## Consecuencias

+ Seguridad por defecto para la demo.
- Con SMTP de un hosting compartido, la entregabilidad depende de SPF y DKIM (configurados); sin métricas de rebote.
