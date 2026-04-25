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
   - El seed usa las variables `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`, `ADMIN_AGENCY_ROLE` si están definidas.
6. Ejecutar en desarrollo:
   - `npm run dev`

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
