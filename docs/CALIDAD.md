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
- API: Postgres 16 de servicio, `npm ci`, `prisma generate`, `migrate deploy`, `tsc`, `npm test --coverage` (incluye las e2e, porque coinciden con `*.test.ts`) y, solo en `push` y si todo pasó, llamada al *webhook* de despliegue de Easypanel.
- Cliente: `npm install --legacy-peer-deps`, pruebas con cobertura, `vite build` y el mismo *webhook*.
- Últimos 4 runs de cada repo en `main`: todos en verde.

Observación: el CI usa Postgres 16 y producción corre Postgres 17 (el `Dockerfile` ya instala `pg_dump` 17 por esa razón).

### 2.4 Monitoreo y operación

- **Sentry** en API y cliente, con limpieza de datos sensibles y pruebas de esa limpieza.
- **Logs** estructurados (pino) con `requestId`, devuelto en `X-Request-Id`; enmascarado de datos personales con pruebas.
- **Salud:** `/api/health` ejecuta `SELECT 1`; `HEALTHCHECK` en el contenedor.
- **Alertas:** respaldo fallido y disco bajo por correo; *heartbeat* opcional.
- **Respaldos:** script del VPS cifrado hacia Google Drive, ensayo de restauración automatizado y procedimiento documentado.
- **Runbook:** `OPERATIONS.md` (despliegue, vuelta atrás, migración fallida, alertas).
- **No verificado:** que haya un monitor externo configurado sobre `/api/health`; que `SENTRY_DSN` esté definido en producción.

### 2.5 Seguridad

Cifrado de datos personales con rotación de clave ensayada, JWT con revocación en base, permisos por módulo con auditoría, límites de peticiones, validación zod, `helmet`, cabeceras de seguridad en nginx, contenedor sin root. `npm audit` de producción en el API: 1 vulnerabilidad moderada en `sanitize-html`.

## 3. Hallazgos y brechas

| # | Brecha | Gravedad | Detalle |
|---|---|---|---|
| H1 | Cobertura del CI no representativa | Alta | Ver 2.2. Un revisor la detecta al abrir la configuración. |
| H2 | Cobertura baja en el cliente | Alta | 27 % real. |
| H3 | `main` sin protección de rama en ambos repos | Alta | Se puede subir código sin pasar por el CI. El despliegue sí exige CI verde, pero el código ya está en `main`. |
| H4 | ~~El CI no ejecuta lint ni comprobación de tipos del cliente~~ Corregido en la fase 3 | Media | `vite build` no comprueba tipos. El cliente tiene 457 avisos de ESLint (420 son `no-explicit-any`), mantenidos sin subir. |
| H5 | ~~El API no tiene ESLint~~ Corregido en la fase 3 | Media | Ahora hay ESLint con línea base de avisos. |
| H6 | ~~Sin `npm audit` ni Dependabot~~ Corregido en la fase 3 | Media | `sanitize-html` actualizado; auditoría y Dependabot en ambos repos. |
| H7 | Importes como `Float` | Media | ADR 008. |
| H8 | ~~Cobertura baja en autenticación, usuarios y tareas~~ Corregido en la fase 5 | Media | Autenticación 80 %, usuarios y tareas 100 %. Plantillas de correo (30 %) y permisos (71 %) siguen bajos. |
| H9 | Sin pruebas de contrato entre API y cliente | Media | Un cambio en una respuesta del API puede romper el cliente sin que ningún test lo avise. |
| H10 | Monitoreo externo y `SENTRY_DSN` sin verificar | Media | Ver 2.4. |
| H11 | Dos mecanismos de respaldo | Baja | ADR 012: decidir cuál es el oficial. |
| H12 | Numeración sin prueba de concurrencia | Baja | ADR 009. |
| H13 | CI en Postgres 16, producción en 17 | Baja | Alinear. |
| H15 | Tipado poco estricto en el cliente | Media | `tsconfig.app.json` del cliente tiene `strictNullChecks`, `noImplicitAny` y `noUnusedLocals` desactivados (el API sí usa `strict`). `tsc` pasa, pero comprueba menos de lo que parece. Activar el modo estricto por pasos es trabajo propio. |
| H16 | ~~Un administrador que restablece la contraseña de otro usuario no cierra sus sesiones abiertas~~ Corregido el 15 de octubre de 2026 | Media | Comprobado con una prueba desechable: tras `PATCH /api/users/:id` con `password`, la sesión anterior del usuario sigue devolviendo 200. El cambio desde el perfil y el restablecimiento por correo sí las cierran. Corregido incrementando `tokenVersion` al cambiar la contraseña; la prueba de `users-management` comprueba que la sesión anterior responde 401 `TOKEN_REVOKED`. |
| H17 | Esquema de validación duplicado y sin uso | Baja | `src/schemas/users.schemas.ts` define otro `updateUserSchema`; las rutas usan `src/validators/users.validator.ts`. El primero induce a error. |
| H14 | Documentos sueltos y antiguos en la raíz de los repos | Baja | Varios `.md` de trabajo (`IMPLEMENTATION_SUMMARY.md`, `EXAMPLES_AND_SCENARIOS.md`, `verify-implementation.sh`, `Notas.txt`, `.docx`) sin dueño claro; conviene ordenarlos o archivarlos. |

## 4. Plan de trabajo

Orden propuesto, por valor frente a un revisor y por esfuerzo. Estado al 15 de octubre de 2026.

| Fase | Trabajo | Cubre | Estado |
|---|---|---|---|
| 1 | Documento de arquitectura y ADR | Documentación | **Hecho** (este conjunto de documentos) |
| 2 | Cobertura honesta: medir todo `src/` en el CI, publicar el número real y fijar umbrales que no bajen | H1, H2 | **Hecho** el 15 de octubre de 2026 (ver 2.2) |
| 3 | Puertas de calidad en el CI: `tsc` y ESLint en el cliente, ESLint en el API, `npm audit`, Dependabot, corregir `sanitize-html` | H4, H5, H6 | **Hecho** el 15 de octubre de 2026 (ver 4.1) |
| 4 | Protección de `main` (CI obligatorio, sin subida directa) | H3 | Pendiente (requiere decidir el flujo de PR) |
| 5 | Subir pruebas de autenticación, usuarios, permisos y tareas | H8 | **Hecho** el 15 de octubre de 2026 (ver 4.2); permisos queda para otra vuelta |
| 6 | Pruebas de contrato o tipos compartidos entre API y cliente | H9 | Pendiente |
| 7 | Monitor externo sobre `/api/health` y verificar `SENTRY_DSN` | H10 | Pendiente |
| 8 | Migrar importes a `Decimal` | H7 | Pendiente (decisión previa, ver ADR 008) |
| 9 | Alinear Postgres de CI (17), decidir el respaldo oficial, ordenar documentos sueltos | H11, H13, H14 | Pendiente |

Criterio de «terminado» para decir «calidad demostrable»: fases 2 a 4 y 7 completas, con la cobertura real publicada en cada ejecución del CI y la protección de rama activa.

### 4.1 Qué quedó de la fase 3

| Puerta | API | Cliente |
|---|---|---|
| Tipos | `npm run build` (`tsc` con `strict`) ya estaba | Nuevo: `npm run typecheck` en el CI |
| Lint | Nuevo: ESLint (typescript-eslint). 0 errores, 261 avisos de línea base | Ya existía; ahora en el CI. 0 errores, 457 avisos de línea base |
| Candado de lint | `npm run lint:ci` falla si hay más de 261 avisos | `npm run lint:ci` falla si hay más de 457 avisos |
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
