# Calidad de Adetravel: evidencia, hallazgos y plan de trabajo

Fecha de la medición: 15 de octubre de 2026. Todo lo de este documento se midió en los repos ese día, salvo lo marcado como **no verificado**. Arquitectura: [`ARQUITECTURA.md`](ARQUITECTURA.md). Decisiones: [`adr/`](adr/README.md).

## 1. Resumen

La base es sólida y demostrable en pruebas, CI, observabilidad y operación. Lo que le falta para ser «calidad demostrable» de forma completa son tres cosas: **cobertura medida con honestidad**, **puertas de calidad en el CI** y **documentación de arquitectura** (esta última queda cubierta con este documento y los ADR).

## 2. Evidencia

### 2.1 Pruebas

| Repo | Pruebas | Resultado |
|---|---|---|
| API, unitarias | 44 suites, 333 pruebas | Todas en verde |
| API, e2e (Postgres real, base propia por corrida) | 27 suites, 153 pruebas | Todas en verde |
| Cliente (Vitest + Testing Library) | 42 archivos, 215 pruebas | Todas en verde |

Las e2e crean una base desechable por ejecución (`scripts/test-e2e.sh`), así dos corridas simultáneas no se pisan, y rechazan cualquier URL que no sea local y de pruebas.

### 2.2 Cobertura real (todo `src/`)

Método: se midió sobre todo `src/` (se excluyeron `src/ops/` y `src/server.ts`) y no solo sobre los archivos elegidos por el CI. En el API se unieron las coberturas de las unitarias y de las e2e.

| Repo | Sentencias | Ramas | Funciones | Líneas |
|---|---|---|---|---|
| API, solo unitarias | 39,1 % | 39,4 % | 42,0 % | 39,2 % |
| API, solo e2e | 63,6 % | 44,9 % | 53,2 % | 66,3 % |
| **API, combinada (114 archivos)** | **77,8 %** | **64,9 %** | **69,4 %** | **79,8 %** |
| Cliente, `src/` completo (sin `components/ui`) | 26,6 % | 26,3 % | 26,1 % | 26,6 % |
| Cliente, lo que mide el CI hoy (5 archivos) | 69,2 % | 64,1 % | 61,6 % | 69,8 % |

**Hallazgo (corregido el 15 de octubre de 2026, fase 2):** el CI medía solo 17 archivos del API y 5 del cliente, elegidos a mano (`jest.config.js`, `vite.config.ts`), con umbrales que se cumplían sobre ese subconjunto, así que el número **no representaba** el sistema. En el cliente la diferencia era grande: 69 % mostrado frente a 27 % real.

**Cómo queda:** ambos repos miden ahora todo `src/` (el API excluye `src/ops` y `server.ts`; el cliente excluye `components/ui`, los tests y los tipos). El resumen de cada ejecución del CI muestra la cobertura. Una corrida única del API (71 suites, 486 pruebas) da 77,4 % de sentencias, 63,7 % de ramas, 68,8 % de funciones y 79,3 % de líneas; el cliente, 26,7 / 26,4 / 26,2 / 26,7 %. Umbrales: API 75 / 62 / 66 / 77 y cliente 25 / 25 / 25 / 25, un poco por debajo de lo medido, y solo se suben.

Archivos grandes del API con menos cobertura (cobertura combinada): tareas 11 %, plantillas de correo 30 %, usuarios 36 %, autenticación 48 %, solicitudes 57 %, `jobs/index` 63 %, middleware de autenticación 65 %.

### 2.3 Pipeline (GitHub Actions)

- Los dos repos tienen CI en `push` y `pull_request` a `main`.
- API: Postgres 17 de servicio, `npm ci`, `prisma generate`, `migrate deploy`, `tsc`, `npm test --coverage` (incluye las e2e, porque coinciden con `*.test.ts`) y, solo en `push` y si todo pasó, llamada al *webhook* de despliegue de Easypanel.
- Cliente: `npm install --legacy-peer-deps`, pruebas con cobertura, `vite build` y el mismo *webhook*.
- Últimos 4 runs de cada repo en `main`: todos en verde.

Desde la fase 9, el CI usa Postgres 17, la misma versión mayor que producción (el `Dockerfile` instala `pg_dump` 17 por esa razón).

### 2.4 Monitoreo y operación

- **Sentry** en API y cliente, con limpieza de datos sensibles y pruebas de esa limpieza.
- **Logs** estructurados (pino) con `requestId`, devuelto en `X-Request-Id`; enmascarado de datos personales con pruebas.
- **Salud:** `/api/health` ejecuta `SELECT 1`; `HEALTHCHECK` en el contenedor.
- **Alertas:** respaldo fallido y disco bajo por correo; *heartbeat* opcional.
- **Respaldos:** script del VPS cifrado hacia Google Drive, ensayo de restauración automatizado y procedimiento documentado.
- **Runbook:** `OPERATIONS.md` (despliegue, vuelta atrás, migración fallida, alertas).
- **Verificado el 16 de octubre de 2026** (ver [`MONITOREO.md`](MONITOREO.md)): `SENTRY_DSN` definido en producción y eventos visibles en Sentry; monitores HTTP de la API y la web y latido del respaldo activos en Better Stack.

### 2.5 Seguridad

Cifrado de datos personales con rotación de clave ensayada, JWT con revocación en base, permisos por módulo con auditoría, límites de peticiones, validación zod, `helmet`, cabeceras de seguridad en nginx, contenedor sin root. `npm audit` de producción en el API: 1 vulnerabilidad moderada en `sanitize-html`.

## 3. Hallazgos y brechas

| # | Brecha | Gravedad | Detalle |
|---|---|---|---|
| H1 | Cobertura del CI no representativa | Alta | Ver 2.2. Un revisor la detecta al abrir la configuración. |
| H2 | Cobertura baja en el cliente | Alta | 27 % real. |
| H3 | ~~`main` sin protección de rama en ambos repos~~ Corregido en la fase 4 | Alta | Se puede subir código sin pasar por el CI. El despliegue sí exige CI verde, pero el código ya está en `main`. |
| H4 | ~~El CI no ejecuta lint ni comprobación de tipos del cliente~~ Corregido en la fase 3 | Media | `vite build` no comprueba tipos. El cliente tiene 451 avisos de ESLint (420 son `no-explicit-any`), mantenidos sin subir. |
| H5 | ~~El API no tiene ESLint~~ Corregido en la fase 3 | Media | Ahora hay ESLint con línea base de avisos. |
| H6 | ~~Sin `npm audit` ni Dependabot~~ Corregido en la fase 3 | Media | `sanitize-html` actualizado; auditoría y Dependabot en ambos repos. |
| H7 | Importes como `Float` | Media | ADR 008. |
| H8 | ~~Cobertura baja en autenticación, usuarios y tareas~~ Corregido en la fase 5 | Media | Autenticación 80 %, usuarios y tareas 100 %. Plantillas de correo (30 %) y permisos (71 %) siguen bajos. |
| H9 | ~~Sin pruebas de contrato entre API y cliente~~ Corregido en la fase 6 | Media | Contrato del API en `contracts/api-contract.json` y copia en el cliente con sus pruebas; ver 4.5 y ADR 017. |
| H10 | ~~Monitoreo externo sin configurar~~ Corregido en la fase 7 | Media | Better Stack (HTTP y latido), Sentry y alertas por correo verificados el 16 de octubre de 2026. |
| H11 | ~~Dos mecanismos de respaldo sin papeles definidos~~ Resuelto en la fase 9 | Baja | ADR 016: el del VPS es el oficial ante desastres; el del API, para error humano. Ambos están activos. Pendiente opcional: latido externo para el del API. |
| H12 | Numeración sin prueba de concurrencia | Baja | ADR 009. |
| H13 | ~~CI en Postgres 16, producción en 17~~ Corregido en la fase 9 | Baja | El CI usa `postgres:17`. |
| H15 | Tipado poco estricto en el cliente | Media | `tsconfig.app.json` del cliente tiene `strictNullChecks`, `noImplicitAny` y `noUnusedLocals` desactivados (el API sí usa `strict`). `tsc` pasa, pero comprueba menos de lo que parece. Activar el modo estricto por pasos es trabajo propio. |
| H16 | ~~Un administrador que restablece la contraseña de otro usuario no cierra sus sesiones abiertas~~ Corregido el 15 de octubre de 2026 | Media | Comprobado con una prueba desechable: tras `PATCH /api/users/:id` con `password`, la sesión anterior del usuario sigue devolviendo 200. El cambio desde el perfil y el restablecimiento por correo sí las cierran. Corregido incrementando `tokenVersion` al cambiar la contraseña; la prueba de `users-management` comprueba que la sesión anterior responde 401 `TOKEN_REVOKED`. |
| H17 | Esquema de validación duplicado y sin uso | Baja | `src/schemas/users.schemas.ts` define otro `updateUserSchema`; las rutas usan `src/validators/users.validator.ts`. El primero induce a error. |
| H18 | El inicio de sesión devolvía campos internos del usuario | Media | `POST /auth/login` y `/auth/register` quitaban solo `passwordHash` y devolvían `tokenVersion`, `resetPasswordToken` y `resetPasswordExpires`. Lo destapó la revisión del contrato; corregido el 16 de octubre de 2026 (PR #86) con una lista blanca. |
| H19 | La fecha de emisión de vouchers y cotizaciones mostraba siempre la fecha de hoy | Media | La vista previa leía `created_at`, que el API no devuelve (devuelve `createdAt`). Lo destapó la comprobación de campos del contrato; corregido el 16 de octubre de 2026 (PR #62 del cliente). Los documentos ya impresos no se corrigen. |
| H20 | La prueba del contrato inflaba la cobertura del cliente (61,3 % mostrado frente a 26,9 % real) | Media | La prueba leía las fuentes con `import.meta.glob("?raw")`; eso hace que Vitest dé por cargados todos los archivos y deje de contar los que no tienen pruebas (el mismo engaño de la fase 2). Introducido en el PR #63, corregido el 18 de octubre de 2026 (PR #65 del cliente) leyendo con `node:fs`. Regla: las pruebas no deben importar fuentes de producción como módulos solo para inspeccionarlas. |
| H21 | Los proveedores aceptan cualquier campo en el cuerpo de la petición | Media | `providerCreateSchema` es `.passthrough()` y el controlador pasa `req.body` a Prisma sin filtrar. Comprobado el 18 de octubre de 2026 con una prueba contra Postgres: quien tiene `MANAGE_PROVIDERS` puede fijar `createdAt` al crear, **cambiar el `id` de un proveedor** con un PATCH (responde 200) y, con un campo que no existe, provoca un 500. No escala privilegios (hace falta el permiso), pero permite corromper registros y rompe la relación con servicios, vouchers y confirmaciones. Pendiente: esquema explícito con los campos del formulario (como el de clientes). |
| H22 | Los correos con plantilla de pagos, vouchers y solicitudes salen con los marcadores sin rellenar | Media | `sendTemplateEmail` solo reemplaza las variables que le pasa quien llama, y `PAYMENT_CONFIRMED`, `VOUCHER_ISSUED` y `REQUEST_CREATED` no pasan ninguna: con una plantilla activa que use `{{client_name}}` el cliente recibe el texto literal. Las cotizaciones ya las pasan (ADR 020). Pendiente: pasar las variables que promete `TEMPLATE_VARIABLES_MAP` en cada controlador. |
| H14 | ~~Documentos sueltos y antiguos en la raíz de los repos~~ Resuelto en la fase 9 | Baja | El 16 de octubre de 2026 se borraron los informes de tareas terminadas y las notas copiadas del API que estaban en el repo del cliente; los documentos útiles pasaron a `docs/` (cliente) y `docs/archivo/` (API, marcados como no revisados). |

## 4. Plan de trabajo

Orden propuesto, por valor frente a un revisor y por esfuerzo. Estado al 15 de octubre de 2026.

| Fase | Trabajo | Cubre | Estado |
|---|---|---|---|
| 1 | Documento de arquitectura y ADR | Documentación | **Hecho** (este conjunto de documentos) |
| 2 | Cobertura honesta: medir todo `src/` en el CI, publicar el número real y fijar umbrales que no bajen | H1, H2 | **Hecho** el 15 de octubre de 2026 (ver 2.2) |
| 3 | Puertas de calidad en el CI: `tsc` y ESLint en el cliente, ESLint en el API, `npm audit`, Dependabot, corregir `sanitize-html` | H4, H5, H6 | **Hecho** el 15 de octubre de 2026 (ver 4.1) |
| 4 | Protección de `main` (CI obligatorio, sin subida directa) | H3 | **Hecho** el 15 de octubre de 2026 (ver 4.4) |
| 5 | Subir pruebas de autenticación, usuarios, permisos y tareas | H8 | **Hecho** el 15 de octubre de 2026 (ver 4.2); permisos queda para otra vuelta |
| 6 | Pruebas de contrato o tipos compartidos entre API y cliente | H9 | **Hecho** el 16 de octubre de 2026 (ADR 017, ver 4.5) |
| 7 | Monitor externo sobre `/api/health` y verificar `SENTRY_DSN` | H10 | **Hecho** el 16 de octubre de 2026 (ver [`MONITOREO.md`](MONITOREO.md)); queda observar la primera ejecución nocturna del respaldo con el latido |
| 8 | Migrar importes a `Decimal` | H7 | Pendiente (decisión previa, ver ADR 008) |
| 9 | Alinear Postgres de CI (17), decidir el respaldo oficial, ordenar documentos sueltos | H11, H13, H14 | **Hecho** el 16 de octubre de 2026 (ADR 016 y `docs/archivo/`) |

Criterio de «terminado» para decir «calidad demostrable»: fases 2 a 4 y 7 completas, con la cobertura real publicada en cada ejecución del CI y la protección de rama activa.

### 4.1 Qué quedó de la fase 3

| Puerta | API | Cliente |
|---|---|---|
| Tipos | `npm run build` (`tsc` con `strict`) ya estaba | Nuevo: `npm run typecheck` en el CI |
| Lint | Nuevo: ESLint (typescript-eslint). 0 errores, 261 avisos de línea base | Ya existía; ahora en el CI. 0 errores, 451 avisos de línea base |
| Candado de lint | `npm run lint:ci` falla si hay más de 261 avisos | `npm run lint:ci` falla si hay más de 451 avisos |
| Auditoría | `npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades | Igual; 2 moderadas conocidas (`uuid` vía `exceljs`) |
| Dependabot | Semanal, agrupa menores y parches; Actions mensual | Igual |
| Node en CI | Subido de 20 a 22, como el `Dockerfile` y `.nvmrc` | Sin cambio |

Detalles que conviene saber:

- **Los avisos heredados son sobre todo `any`** (245 en el API, 420 en el cliente). `no-explicit-any` pasó de error a aviso y el candado impide que aumenten; el trabajo es bajar el número.
- **`sanitize-html` 2.13.1 → 2.18.1** corrige las 3 vulnerabilidades moderadas conocidas (esquemas `javascript:` y XSS por SVG). Las versiones corregidas exigen `htmlparser2` 12, que es solo ESM: Node 22 lo carga sin problema (comprobado con el código compilado, que elimina `<script>`, `onclick` y enlaces `javascript:`), pero Jest necesitó una transformación para esos paquetes (`jest.config.js`).
- **Vulnerabilidades moderadas del cliente:** `uuid` llega por `exceljs`; la única corrección que ofrece npm es retroceder `exceljs` a la versión 3.4, que no tiene sentido. Se revisan con Dependabot y no bloquean el CI.

### 4.2 Qué quedó de la fase 5

Tres suites e2e nuevas contra Postgres real (59 pruebas): `auth-flows`, `users-management` y `tasks`.

- **Autenticación:** inicio de sesión (mismo error para correo inexistente y contraseña errónea, cuenta desactivada), `/me`, token ausente, mal firmado y caducado, cambio de contraseña desde el perfil (invalida la sesión anterior y entrega un token nuevo), invitación (permiso, correo normalizado, enlace de 7 días, duplicados), recuperación de contraseña (sin enumeración de usuarios, enlace de 1 hora, de un solo uso, cierra sesiones) y cierre de sesión.
- **Usuarios:** permisos por endpoint, listado con filtros, protecciones contra cambiarse el propio rol, desactivarse o borrarse, que no se pueda colar `passwordHash` ni `tokenVersion`, cambio de correo y de contraseña por el administrador, y que desactivar a alguien le corte el acceso.
- **Tareas:** propias y delegadas, reasignación, notificaciones, bitácora, filtros y borrado, y que un tercero no vea ni modifique tareas ajenas.

Cobertura de todo `src/` tras la fase (corrida única, 545 pruebas): 82,4 % de sentencias, 69,6 % de ramas, 73,8 % de funciones y 84,3 % de líneas (antes 77,4 / 63,7 / 68,8 / 79,3). Autenticación pasó de 48 % a 80 %, el middleware de autenticación de 65 % a 83 %, usuarios de 36 % a 100 % y tareas de 11 % a 100 %. Umbrales nuevos: 80 / 67 / 71 / 82.

Nota sobre la medición: en esa corrida el servidor estaba saturado (carga de unos 200 por otros despliegues del VPS) y 2 pruebas antiguas agotaron su tiempo; las cifras podrían ser algo mayores. Con la carga normal pasan las 30 suites e2e (212 pruebas) y las 44 unitarias (333).

### 4.3 Migraciones pendientes (saltos de versión mayor)

Dependabot propuso estos saltos el 15 de octubre de 2026 y se cerraron porque hoy no se pueden aplicar. Dependabot ignora ahora sus versiones mayores.

| Paquete | Salto | Motivo del bloqueo | Qué hay que hacer |
|---|---|---|---|
| `@sentry/node` | 10 → 11 | La opción `sendDefaultPii` ya no existe; la compilación falla. Esa opción evita enviar IP, cookies y cuerpos de las peticiones. | Leer la guía de migración, localizar el equivalente y comprobar con una prueba que no se envían datos personales, antes de subir. |
| `typescript` | 6 → 7 | `ts-jest` declara `typescript >=4.3 <7`; `npm ci` falla con `ERESOLVE`. | Esperar a que `ts-jest` soporte TypeScript 7. |
| `dotenv` | 17 → 18 | Publica sus tipos solo por `exports`; `tsconfig.json` usa `moduleResolution: node`, que lo ignora (`TS2882`). | Cambiar la resolución de módulos (por ejemplo a `node16`), con el resto de ajustes que eso implica. |

### 4.4 Protección de `main` (fase 4)

Aplicada el 15 de octubre de 2026 en `adetravel-api` y `adetravel-client`:

| Regla | Valor |
|---|---|
| Pull request obligatorio | Sí. No se puede subir directo a `main`. |
| Comprobación obligatoria | `Inspector de Backend` (API) / `Inspector de Frontend` (cliente): el CI de la rama debe pasar. |
| Aprobaciones requeridas | 0. El equipo es una persona y GitHub no permite aprobar el propio PR; el control es el CI. Subir a 1 cuando haya una segunda persona. |
| Aplica a administradores | Sí. Para una urgencia se desactiva un momento en Settings → Branches. |
| Rama al día con `main` antes de fusionar | No. Menos fricción con los PR de Dependabot; los conflictos reales siguen impidiendo fusionar. |
| Force-push y borrado de `main` | Prohibidos. |

Efecto sobre el despliegue: el paso «Notificar a EasyPanel» sigue ejecutándose en el `push` que genera la fusión de un PR, así que el flujo normal no cambia.

Limitación: la protección exige que el CI de la rama pase, pero el CI no se ejecuta contra el resultado de la fusión. Con «rama al día» desactivado, dos PR sanos podrían romper `main` al fusionarse uno tras otro; el CI de `main` lo detectaría, pero después de fusionar.

### 4.5 Contrato API-cliente (fase 6)

`contracts/api-contract.json` es la instantánea aceptada de 19 respuestas clave y de las listas de valores que el cliente duplica (ADR 017). El test `api-contract.e2e.test.ts` la compara con el API real en cada ejecución del CI. El cliente guarda una copia (`src/contracts/api-contract.json`) y 16 pruebas la usan.

**Qué se vigila**

| Lado | Comprobación |
|---|---|
| API | La forma de las respuestas y las listas de valores no cambian sin aceptar el cambio a propósito. |
| Cliente | Sus 17 estados del flujo, las transiciones, etiquetas, colores, tipos de servicio y permisos coinciden con el API. |
| Cliente | Todo campo que los componentes leen de 10 entidades existe en la respuesta del API. |
| Cliente | Su copia del contrato es idéntica a la del API en `main` (se omite con aviso si no hay red). |

**Flujo de un cambio**

1. Se cambia una respuesta o una lista de valores en el API. El CI del API falla.
2. `UPDATE_CONTRACT=1 npm run test:e2e`, y el diff de `contracts/api-contract.json` se revisa en el pull request.
3. Al fusionar, el CI del cliente falla en todos sus PR hasta ejecutar `npm run contract:sync` y ajustar lo que dependa del cambio.

**Frutos de la fase**

- **H18:** el inicio de sesión devolvía campos internos del usuario (PR #86 del API).
- **H19:** la fecha de emisión de vouchers y cotizaciones mostraba siempre la de hoy (PR #62 del cliente).
- Una fragilidad corregida de paso: el test de estadísticas de la bitácora comparaba cifras globales en dos llamadas y podía fallar si otra suite borraba entradas entre ambas; ahora siembra un margen amplio de eventos propios.

**Límites**

- Verifica la forma con los datos de la muestra, no el uso que hace el cliente de cada campo.
- La búsqueda de campos leídos es una heurística por nombre de variable (`client.`, `quotation.`...) dentro de la carpeta de cada módulo; no cubre `pages/` ni otras variables.
- Cada cambio intencionado del API exige un PR de sincronización en el cliente.

## 5. Cómo reproducir las mediciones

```bash
# API: pruebas
cd adetravel-api && npm test -- --testPathIgnorePatterns e2e   # unitarias
npm run test:e2e                                               # e2e (Postgres local en Docker)

# API: cobertura de todo src/ (una corrida por tipo y se unen los coverage-final.json)
npx jest --testPathIgnorePatterns e2e --coverage --coverageThreshold='{}' \
  --collectCoverageFrom='src/**/*.ts' --collectCoverageFrom='!src/ops/**' \
  --collectCoverageFrom='!src/server.ts' --coverageReporters=json --coverageDirectory=/tmp/cov-unit
bash scripts/test-e2e.sh --coverage --coverageThreshold='{}' \
  --collectCoverageFrom='src/**/*.ts' --collectCoverageFrom='!src/ops/**' \
  --collectCoverageFrom='!src/server.ts' --coverageReporters=json --coverageDirectory=/tmp/cov-e2e

# Cliente: cobertura de todo src/
cd adetravel-client && npx vitest run --coverage --coverage.reporter=text-summary \
  --coverage.include='src/**/*.{ts,tsx}' --coverage.exclude='src/components/ui/**' \
  --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 \
  --coverage.thresholds.functions=0 --coverage.thresholds.lines=0
```
