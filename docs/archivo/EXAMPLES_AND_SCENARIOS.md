# 🧪 Ejemplos Prácticos: Flujo de Notificaciones de Pago

## Scenario 1: Cambiar pago a COMPLETADO (disparador activo)

### Request HTTP:
```bash
PATCH /api/payments/{paymentId}/status
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

{
  "status": "COMPLETADO",
  "notes": "Pago recibido en cuenta corriente"
}
```

### Respuesta (200 OK):
```json
{
  "data": {
    "id": "pago-uuid-123",
    "paymentNumber": "PAG-20260729-001",
    "requestId": "req-uuid",
    "clientId": "client-uuid",
    "amount": 100.00,
    "currency": "CLP",
    "status": "COMPLETADO",
    "method": "TRANSFERENCIA",
    "createdAt": "2026-07-25T10:30:00Z",
    "updatedAt": "2026-07-29T14:22:55Z"
  }
}
```

### Efecto secundario automático (en BD):
```sql
-- Notificación creada automáticamente en tabla 'notifications'
INSERT INTO notifications (
  id, userId, title, message, type, isRead, 
  relatedEntityType, relatedEntityId, createdAt
) VALUES (
  'notif-uuid-789',
  'user-uuid-456',  -- request.createdBy
  'Pago Recibido 🎉',
  'El pago PAG-20260729-001 por 100.00 CLP ha sido completado.',
  'PAYMENT_COMPLETED',
  false,
  'PAGO',
  'pago-uuid-123',
  '2026-07-29T14:22:55Z'
);
```

### Validación (selectores):
```javascript
// Frontend puede verificar la notificación con:
GET /api/notifications?userId=user-uuid-456&isRead=false

Respuesta:
{
  "data": [{
    "id": "notif-uuid-789",
    "userId": "user-uuid-456",
    "title": "Pago Recibido 🎉",
    "message": "El pago PAG-20260729-001 por 100.00 CLP ha sido completado.",
    "type": "PAYMENT_COMPLETED",
    "isRead": false,
    "relatedEntityType": "PAGO",
    "relatedEntityId": "pago-uuid-123",
    "createdAt": "2026-07-29T14:22:55Z"
  }],
  "total": 1
}
```

---

## Scenario 2: Cambiar de COMPLETADO a CANCELADO (NO dispara notificación)

### Request HTTP:
```bash
PATCH /api/payments/{paymentId}/status
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

{
  "status": "CANCELADO",
  "notes": "Chequera sin fondos"
}
```

### Resultado:
- ✅ Pago se actualiza a CANCELADO
- ❌ **NO se crea notificación** (prevWasCompleted = true)
- ✅ Respuesta HTTP 200 OK

### Razón:
```typescript
const justCompleted = !prevWasCompleted && newStatusIsCompleted;
// !true && false = false ← NO dispara
```

---

## Scenario 3: Cambiar de PENDIENTE a PENDIENTE (sin cambios)

### Resultado:
- ✅ Pago se actualiza (al menos los timestamps)
- ❌ **NO se crea notificación** (newStatusIsCompleted = false)
- ✅ Respuesta HTTP 200 OK

---

## 🔄 Flujo Completo de Usuario (Backend + Frontend)

### paso 1: Usuario abre dashboard de pagos

```
Frontend:
  GET /api/payments?status=PENDIENTE
  ├─ Muestra lista de pagos pendientes
  └─ Renderiza botón "Marcar como Completado"
```

### Paso 2: Usuario proporciona pago

```
Frontend:
  PATCH /api/payments/{paymentId}/status
  ├─ Body: { "status": "COMPLETADO" }
  └─ Espera respuesta 200 OK
```

### Paso 3: Backend procesa pago

```
Backend (payments.controller.changePaymentStatus):
  1. Valida autenticación ✅
  2. Busca pago existente ✅
  3. Valida transición de estado ✅
  4. Detecta que pago pasó a COMPLETADO ✅
  5. Actualiza pago en BD ✅
  6. Envía email al cliente ✅
  7. CREA NOTIFICACIÓN automáticamente 🎉
     └─ userId = request.createdBy (gerente/agente)
     └─ title = "Pago Recibido 🎉"
     └─ message = "El pago PAG-... por $100 CLP ha sido completado"
  8. Retorna respuesta 200 OK
```

### Paso 4: Frontend recibe confirmación

```
Frontend:
  ├─ Actualiza estado local del pago a COMPLETADO
  ├─ Muestra toast/snackbar de éxito
  └─ Refresca lista de pagos
```

### Paso 5: Gerente ve notificación

```
Frontend (Gerente - quien creó solicitud):
  1. Recibe notificación (polling cada 5s o WebSocket)
  2. Muestra badge en campana con "1" (notificación no leída)
  3. Al clickear:
     ├─ Abre panel de notificaciones
     ├─ Muestra: "Pago Recibido 🎉"
     │          "El pago PAG-... por $100 CLP ha sido completado"
     └─ Botón: "Marcar como leída"
  4. Si hace clic en "Marcar como leída":
     └─ PATCH /api/notifications/{notificationId}
        └─ Body: { "isRead": true }
```

---

## 📊 Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────┐
│ Cliente hace PATCH /payments/{id}/status → COMPLETADO  │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │ changePaymentStatus│
        └────────┬───────────┘
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
  Validar Estado      Comparar Estados
  (transición OK)     (prev vs new)
      │                     │
      └────────┬────────────┘
               ▼
    ┌─────────────────────────┐
    │ Actualizar Pago en BD   │
    └────────┬────────────────┘
             │
      ┌──────┴──────┬──────────────┐
      ▼             ▼              ▼
  Enviar Email  Disparar Notif  Sincr. Req
  (si completo) (si just compl)  (si compl)
      │             │              │
      └─────────────┼──────────────┘
                    ▼
        ┌──────────────────────────┐
        │ Retornar 200 OK          │
        │ (incluso si notif falla) │
        └──────────────────────────┘
```

---

## 🛡️ Manejo de Errores

### Si la notificación falla:

```javascript
try {
  await prisma.notification.create({...})
} catch (e) {
  console.error("Error creando notificación:", e);
  // NO retorna error al cliente
  // Pago ya fue actualizado OK
  // Cliente recibe 200 OK de todas formas
}
```

### Logs esperados:
```
[2026-07-29 14:22:55] ✅ Pago PAG-20260729-001 actualizado
[2026-07-29 14:22:55] ✅ Email de confirmación enviado
[2026-07-29 14:22:56] ✅ Notificación creada (user: user-456)
```

### Si hay error en notificación:
```
[2026-07-29 14:22:55] ✅ Pago PAG-20260729-001 actualizado
[2026-07-29 14:22:55] ✅ Email de confirmación enviado
[2026-07-29 14:22:56] ❌ Error: No existe usuario user-456
[2026-07-29 14:22:56]    → Respuesta sigue siendo 200 OK
```

---

## 🔧 Campos de Notificación Explicados

```typescript
{
  userId: "user-uuid-456",              // ← A quién se enviará
  title: "Pago Recibido 🎉",            // ← Título corto (max 100 chars)
  message: "El pago PAG-... has...",    // ← Detalle (max 500 chars)
  type: "PAYMENT_COMPLETED",            // ← Categoría para filtrar
  isRead: false,                        // ← 0 notificaciones leídas
  relatedEntityType: "PAGO",            // ← Tipo de entidad relacionada
  relatedEntityId: "pago-uuid-123",     // ← ID para vincular
  createdAt: "2026-07-29T14:22:55Z"    // ← Timestamp
}
```

---

## ✅ Checklist de Validación Manual

1. **Crear un pago en estado PENDIENTE**
   - [ ] POST /api/payments
   - [ ] Guardar `{paymentId}`

2. **Cambiar a COMPLETADO**
   - [ ] PATCH /api/payments/{paymentId}/status
   - [ ] Body: `{ "status": "COMPLETADO" }`
   - [ ] Response: 200 OK

3. **Verificar notificación creada**
   - [ ] GET /api/notifications?isRead=false
   - [ ] Debe incluir notificación con data.type = "PAYMENT_COMPLETED"
   - [ ] Verifica `relatedEntityId` = paymentId

4. **Verificar que NO se crea si cambia de COMPLETADO a CANCELADO**
   - [ ] PATCH /api/payments/{paymentId}/status
   - [ ] Body: `{ "status": "CANCELADO" }`
   - [ ] Response: 200 OK
   - [ ] GET /api/notifications → debe mantener MISMO conteo

---

## 📞 Troubleshooting

**Problema**: Notificación no se crea pero pago se actualiza
- ✅ Comportamiento CORRECTO (try/catch activo)
- Revisar logs: `console.error()` debe mostrar el error

**Problema**: Pago no se actualiza a COMPLETADO
- ❌ Revisar transiciones válidas en `VALID_TRANSITIONS`
- Revisar status anterior (¿permite transición a COMPLETADO?)

**Problema**: Notificación muestra userId incorrecto
- Revisar lógica: `const userToNotify = updated.request?.createdBy || req.user?.id`
- Si request.createdBy es null, usa req.user?.id del JWT

---

**Última actualización**: 29 de julio de 2026  
**Versión**: 1.0
