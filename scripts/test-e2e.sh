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

export DATABASE_URL="$URL"
echo "test-e2e: migrando ${URL%%\?*}"
npx prisma migrate deploy
npx jest --testPathPatterns '\.e2e\.test\.ts$' "$@"
