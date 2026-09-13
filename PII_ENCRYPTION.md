# Cifrado de PII de Cliente en reposo

`passportNumber`, `bankAccount` y `bankAccountHolder` del modelo `Client` se
cifran en la base de datos (AES-256-GCM). El resto de los campos de Cliente
(nombre, email, RUT, dirección, `bankName`, `bankEmail`, fechas de pasaporte,
etc.) sigue en texto plano — no son secretos por sí solos.

## Cómo funciona

Todo pasa por una extensión de Prisma Client
(`src/lib/client-pii-extension.ts`), transparente para el resto del código:

- **Al escribir** (`create`/`update`/`upsert`/`createMany`/`updateMany` sobre
  `Client`): los 3 campos se cifran antes de llegar a Postgres.
- **Al leer**: cada campo se redefine como un *computed field* que descifra
  el valor crudo. Esto se aplica en **cualquier lugar donde aparezca el
  modelo Client** — incluyendo `include: { client: true }` desde
  Payment/Voucher/Request/Quotation/Service — sin tener que tocar esos
  controllers.
- El cifrado real vive en `src/lib/pii-encryption.ts` (`encryptPII`/
  `decryptPII`), con formato de salida `v1:<iv>:<authTag>:<ciphertext>`
  (todo en base64). El prefijo de versión permite cambiar de algoritmo/clave
  en el futuro sin romper los datos ya cifrados.

### Efecto colateral: búsqueda de clientes

`GET /clients?search=` ya **no** busca por `passportNumber`: Postgres no
puede hacer `LIKE` parcial contra una columna cifrada (el mismo valor
cifrado dos veces da un resultado distinto, por diseño de AES-GCM). Sigue
buscando por nombre, apellido, email, teléfono y RUT igual que antes.

## Variable de entorno requerida

`PII_ENCRYPTION_KEY` — 32 bytes en hexadecimal (64 caracteres). Es
**obligatoria**: `src/config/env.ts` la exige al arrancar, igual que
`JWT_SECRET` — sin ella el backend no levanta.

Generarla con:

```bash
openssl rand -hex 32
```

**Guardá esa clave en un lugar seguro por fuera de Easypanel** (un gestor de
contraseñas). Si se pierde, todo lo cifrado con ella queda
**irrecuperable para siempre** — no existe ningún mecanismo de recuperación
sin la clave exacta. Tratala con el mismo cuidado que una clave privada.

Nunca reutilices una clave que haya aparecido en texto plano en un chat, un
PR, un log o un ticket — considerala comprometida y generá una nueva.

## Desplegar esto por primera vez

1. Generar la clave (`openssl rand -hex 32`) y configurar
   `PII_ENCRYPTION_KEY` en las variables de entorno del backend en Easypanel
   **antes** de mergear/desplegar el código que la exige.
2. Guardar la clave en un lugar seguro fuera de Easypanel.
3. Desplegar y confirmar que el backend levanta bien.
4. Correr el backfill **una sola vez** para cifrar los clientes que ya
   existían antes de este cambio (ver abajo).

## Backfill de clientes existentes

Los clientes creados antes de este cambio quedan en texto plano hasta que se
corre este script. Es seguro re-ejecutarlo cuantas veces haga falta: cada
campo se cifra a lo sumo una vez (si ya tiene el formato `v1:...` lo salta).

Vía la terminal de Easypanel (o donde corra el backend):

```bash
# 1. Preview: no escribe nada, solo muestra cuántas filas se tocarían
npm run pii:encrypt-backfill -- --dry-run

# 2. Aplicar de verdad
npm run pii:encrypt-backfill
```

Recomendado: hacer un backup de la base de datos antes de correr el paso 2
(es una migración de datos real sobre la tabla `clients`).

## Verificar que quedó bien

Desde la terminal de Easypanel, conectado a la base:

```sql
SELECT "passportNumber", "bankAccount", "bankAccountHolder"
FROM "clients"
WHERE "passportNumber" IS NOT NULL
LIMIT 5;
```

Los valores deben verse como `v1:...:...:...` (no como el pasaporte/cuenta
en texto plano). La API sigue devolviendo el valor real de siempre — el
cifrado es completamente transparente para el frontend.

## Rotar la clave

No hay soporte automático todavía. Para rotar `PII_ENCRYPTION_KEY`:

1. Con la clave vieja aún activa, descifrar todo (se puede adaptar el script
   de backfill para hacer el camino inverso) o mantener temporalmente ambas
   claves disponibles y migrar campo por campo.
2. Este es un procedimiento delicado — coordinar antes de intentarlo en
   producción.
