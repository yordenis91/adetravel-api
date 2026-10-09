#!/usr/bin/env bash
# Corre los tests e2e (__tests__/*.e2e.test.ts) contra un Postgres 17 local y desechable.
#
# - Usa el contenedor `adtv-dev-pg` (127.0.0.1:55432); lo crea o arranca si hace falta.
# - Aplica las migraciones (`prisma migrate deploy`) antes de los tests: sin ellas los e2e
#   fallan en `prisma.user.create` con "The table public.users does not exist".
# - NUNCA usa el DATABASE_URL del entorno: apunta siempre a la base de pruebas. Para usar otra,
#   define TEST_DATABASE_URL (solo se acepta localhost/127.0.0.1 y un nombre de base que termine en _test).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

CONTAINER="${TEST_DB_CONTAINER:-adtv-dev-pg}"
PORT="${TEST_DB_PORT:-55432}"
DEFAULT_URL="postgresql://test:test@127.0.0.1:${PORT}/adetravel_test?schema=public"
URL="${TEST_DATABASE_URL:-$DEFAULT_URL}"

if [[ ! "$URL" =~ ^postgres(ql)?://[^@/]+@(localhost|127\.0\.0\.1)(:[0-9]+)?/[A-Za-z0-9_]+_test(\?.*)?$ ]]; then
  echo "test-e2e: rechazo '$URL': solo se permiten bases locales cuyo nombre termine en _test." >&2
  exit 1
fi

if [[ "$URL" == "$DEFAULT_URL" ]]; then
  if ! command -v docker >/dev/null; then
    echo "test-e2e: falta docker para levantar $CONTAINER (o define TEST_DATABASE_URL)." >&2
    exit 1
  fi
  state="$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo missing)"
  case "$state" in
    running) ;;
    missing)
      echo "test-e2e: creando $CONTAINER (postgres:17, 127.0.0.1:${PORT})..."
      docker volume create adtv-dev-pgdata >/dev/null
      docker run -d --name "$CONTAINER" --restart unless-stopped \
        -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=adetravel_test \
        -p "127.0.0.1:${PORT}:5432" -v adtv-dev-pgdata:/var/lib/postgresql/data postgres:17 >/dev/null
      ;;
    *)
      echo "test-e2e: arrancando $CONTAINER ($state)..."
      docker start "$CONTAINER" >/dev/null
      ;;
  esac
  for _ in $(seq 1 30); do
    docker exec "$CONTAINER" pg_isready -U test -d adetravel_test >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec "$CONTAINER" pg_isready -U test -d adetravel_test >/dev/null
fi

# Con la base por defecto cada corrida usa su propia base (adetravel_<pid>_test), que se borra al
# terminar: así dos corridas simultáneas (otra terminal, otra sesión) no se pisan los datos.
RUN_DB=""
if [[ "$URL" == "$DEFAULT_URL" ]]; then
  RUN_DB="adetravel_$$_test"
  # Limpia bases huérfanas de corridas que murieron sin ejecutar el trap (su PID ya no existe).
  for old in $(docker exec "$CONTAINER" psql -U test -d postgres -Atc "select datname from pg_database where datname ~ '^adetravel_[0-9]+_test\$'"); do
    pid="${old#adetravel_}"; pid="${pid%_test}"
    kill -0 "$pid" 2>/dev/null || docker exec "$CONTAINER" psql -U test -d postgres -qc "drop database if exists \"$old\" with (force)" >/dev/null
  done
  docker exec "$CONTAINER" psql -U test -d postgres -qc "create database \"$RUN_DB\"" >/dev/null
  cleanup() { docker exec "$CONTAINER" psql -U test -d postgres -qc "drop database if exists \"$RUN_DB\" with (force)" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  URL="${DEFAULT_URL/\/adetravel_test?/\/$RUN_DB?}"
fi

export DATABASE_URL="$URL"
echo "test-e2e: migrando ${URL%%\?*}"
npx prisma migrate deploy
npx jest --testPathPatterns '\.e2e\.test\.ts$' "$@"
