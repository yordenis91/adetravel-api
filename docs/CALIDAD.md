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

**Hallazgo:** el CI mide solo 17 archivos del API y 5 del cliente, elegidos a mano (`jest.config.js`, `vite.config.ts`), con umbrales que se cumplen sobre ese subconjunto. Es una decisión explícita y comentada en el código, pero el número que muestra el CI **no representa** el sistema. En el cliente la diferencia es grande: 69 % mostrado frente a 27 % real.

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
| H4 | El CI no ejecuta lint ni comprobación de tipos del cliente | Media | `vite build` no comprueba tipos. El cliente tiene 457 avisos de ESLint (420 son `no-explicit-any`), mantenidos sin subir. |
| H5 | El API no tiene ESLint | Media | No hay configuración de lint. |
| H6 | Sin `npm audit` ni Dependabot | Media | 1 vulnerabilidad moderada en producción (`sanitize-html`). |
| H7 | Importes como `Float` | Media | ADR 008. |
| H8 | Cobertura baja en autenticación, usuarios y tareas | Media | Autenticación es la más sensible. |
| H9 | Sin pruebas de contrato entre API y cliente | Media | Un cambio en una respuesta del API puede romper el cliente sin que ningún test lo avise. |
| H10 | Monitoreo externo y `SENTRY_DSN` sin verificar | Media | Ver 2.4. |
| H11 | Dos mecanismos de respaldo | Baja | ADR 012: decidir cuál es el oficial. |
| H12 | Numeración sin prueba de concurrencia | Baja | ADR 009. |
| H13 | CI en Postgres 16, producción en 17 | Baja | Alinear. |
| H14 | Documentos sueltos y antiguos en la raíz de los repos | Baja | Varios `.md` de trabajo (`IMPLEMENTATION_SUMMARY.md`, `EXAMPLES_AND_SCENARIOS.md`, `verify-implementation.sh`, `Notas.txt`, `.docx`) sin dueño claro; conviene ordenarlos o archivarlos. |

## 4. Plan de trabajo

Orden propuesto, por valor frente a un revisor y por esfuerzo. Estado al 15 de octubre de 2026.

| Fase | Trabajo | Cubre | Estado |
|---|---|---|---|
| 1 | Documento de arquitectura y ADR | Documentación | **Hecho** (este conjunto de documentos) |
| 2 | Cobertura honesta: medir todo `src/` en el CI, publicar el número real y fijar umbrales que no bajen | H1, H2 | Pendiente |
| 3 | Puertas de calidad en el CI: `tsc` y ESLint en el cliente, ESLint en el API, `npm audit`, Dependabot, corregir `sanitize-html` | H4, H5, H6 | Pendiente |
| 4 | Protección de `main` (CI obligatorio, sin subida directa) | H3 | Pendiente (requiere decidir el flujo de PR) |
| 5 | Subir pruebas de autenticación, usuarios, permisos y tareas | H8 | Pendiente |
| 6 | Pruebas de contrato o tipos compartidos entre API y cliente | H9 | Pendiente |
| 7 | Monitor externo sobre `/api/health` y verificar `SENTRY_DSN` | H10 | Pendiente |
| 8 | Migrar importes a `Decimal` | H7 | Pendiente (decisión previa, ver ADR 008) |
| 9 | Alinear Postgres de CI (17), decidir el respaldo oficial, ordenar documentos sueltos | H11, H13, H14 | Pendiente |

Criterio de «terminado» para decir «calidad demostrable»: fases 2 a 4 y 7 completas, con la cobertura real publicada en cada ejecución del CI y la protección de rama activa.

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
