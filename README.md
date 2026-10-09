# AdeTravel Backend

Backend empresarial para AdeTravel, construido con Node.js, TypeScript, Express, Prisma y PostgreSQL.

## Stack
- Node.js + TypeScript
- Express.js
- PostgreSQL + Prisma
- JWT auth
- Zod validation
- Nodemailer
- Pino logger

## Instalacion
1. Copiar variables de entorno:
   - `cp .env.example .env`
2. Instalar dependencias:
   - `npm install`
3. Generar cliente Prisma:
   - `npm run prisma:generate`
4. Ejecutar migraciones:
   - `npm run prisma:migrate`
5. Crear usuario administrador inicial:
   - `npm run seed:admin`
   - `ADMIN_EMAIL` y `ADMIN_PASSWORD` son **obligatorias** (no hay valores por defecto) y la contraseña debe cumplir la política (8+ caracteres, mayúscula, número y uno de `!@#$%^&*`). Opcionales: `ADMIN_FULL_NAME`, `ADMIN_AGENCY_ROLE`. La contraseña no se imprime.
   - Los seeds de datos de ejemplo (`seed:users`, `seed:clients`, `seed:providers`, `seed:flow`) se niegan a correr con `NODE_ENV=production` salvo `ALLOW_DEMO_SEED=true`. Los usuarios de prueba usan `SEED_USERS_PASSWORD` o, solo fuera de producción, `Agencia123!`.
6. Ejecutar en desarrollo:
   - `npm run dev`

## Tests

- `npm test`: unitarios (sin base de datos) y, si hay una base migrada en `DATABASE_URL`, también los e2e.
- `npm run test:e2e`: solo los e2e (`__tests__/*.e2e.test.ts`) contra un Postgres 17 local desechable. El script crea o arranca el contenedor `adtv-dev-pg` (127.0.0.1:55432), aplica las migraciones y corre los tests. Ignora el `DATABASE_URL` del entorno para no tocar una base real; para usar otra define `TEST_DATABASE_URL` (solo local y con nombre terminado en `_test`).
- **Aislamiento entre corridas:** con la base por defecto, cada `npm run test:e2e` crea su propia base `adetravel_<pid>_test` dentro de `adtv-dev-pg`, la migra y la borra al terminar (también limpia las huérfanas de corridas que murieron). Así dos corridas simultáneas (otra terminal u otra sesión) no se pisan los datos; antes compartían `adetravel_test` y daban fallos intermitentes. Con `TEST_DATABASE_URL` se usa esa base tal cual y no se crea nada. La suite `pii-key-rotation` también usa una base propia con el PID en el nombre.
- No lances varias corridas completas a la vez en el servidor de la demo (7,7 GB de RAM compartidos con Easypanel): puede provocar OOM y reiniciar los contenedores. Si necesitas paralelismo, usa `npm run test:e2e -- --maxWorkers=2`.
- `npm test` a secas también ejecuta los e2e sin base ni migraciones y falla: para los unitarios usa `npx jest --testPathIgnorePatterns e2e`.
- Si un e2e falla con `The table public.users does not exist`, la base no tiene migraciones: usa `npm run test:e2e`.

## Endpoints base
- API base: `http://localhost:3000/api`
- Health: `GET /health`

## Seguridad implementada
- Helmet para headers seguros
- CORS restringido a `FRONTEND_URL`
- Rate limit configurable (default 100/15m)
- JWT auth en todas las rutas salvo `POST /api/auth/login`
- Middleware de rol para endpoints de ADMIN
- Validacion de payloads con Zod
- Error handler global
- Cifrado en reposo de PII sensible de Cliente (pasaporte, cuenta bancaria) — ver [`PII_ENCRYPTION.md`](./PII_ENCRYPTION.md)

## Operación en producción (Easypanel)
Arranque, apagado ordenado, health checks y cómo recuperarse de una migración
fallida (P3009) sin tener que tocar el `CMD` del Dockerfile — ver
[`OPERATIONS.md`](./OPERATIONS.md).

## Respuesta estandar
- Lista paginada: `{ data, total, page, limit }`
- Objeto: `{ data }`
- Error: `{ error, code }`

## Estructura relevante
- `src/app.ts`: bootstrap de Express y middlewares
- `src/routes/`: enrutamiento modular
- `src/controllers/`: logica de negocio por recurso
- `src/services/`: email, numeracion, activity logs
- `src/middlewares/`: auth, role, validation, error handler
- `src/utils/`: helpers comunes (response, logger, errors)

## Frontend (reemplazo SDK Buildy)
Crea `src/lib/api.ts` en tu frontend:

```ts
const BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

async function request(path: string, options?: RequestInit) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...options
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body: unknown) =>
    request(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path: string, body: unknown) =>
    request(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => request(path, { method: "DELETE" })
};
```

Reemplaza imports de `@/entities` por `@/lib/api`.
