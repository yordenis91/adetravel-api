#!/usr/bin/env bash
# Ensayo de restauración del backup: descarga el último dump del bucket, lo restaura en una base
# desechable dentro del contenedor local de Postgres (adtv-dev-pg) y verifica que la base sirve y que
# PII_ENCRYPTION_KEY descifra los datos personales. No toca la base real ni imprime datos.
#
# Credenciales: en .env.restore (ignorado por git) o en el entorno:
#   BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY,
#   PII_ENCRYPTION_KEY (la vigente cuando se hizo el backup).
# Opcional: KEEP_RESTORE_DB=1 para no borrar la base restaurada al terminar.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ENV_FILE="${RESTORE_ENV_FILE:-.env.restore}"
# Las variables ya definidas en el entorno mandan sobre el archivo (p. ej. para probar otra clave).
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r name value; do
    [[ "$name" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
    [[ -n "${!name:-}" ]] || export "$name=$value"
  done < "$ENV_FILE"
fi

CONTAINER="${TEST_DB_CONTAINER:-adtv-dev-pg}"
PORT="${TEST_DB_PORT:-55432}"
DB="adetravel_restore_test"
DUMP="$(mktemp -t adetravel-restore-XXXXXX.dump)"
trap 'rm -f "$DUMP"' EXIT

if [[ "$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo missing)" != "running" ]]; then
  echo "restore-drill: el contenedor $CONTAINER no está corriendo (npm run test:e2e lo crea)." >&2
  exit 1
fi

echo "== 1. Descarga del último backup"
npx ts-node scripts/restore-drill.ts download "$DUMP"

echo "== 2. Restauración en $DB (base desechable en $CONTAINER)"
docker exec "$CONTAINER" psql -U test -d postgres -qc "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
started=$(date +%s)
# --no-owner/--no-acl: los roles de producción no existen aquí. Los avisos de pg_restore se muestran,
# pero la verificación del paso 3 es la que decide si el backup sirve.
docker exec -i "$CONTAINER" pg_restore -U test -d "$DB" --no-owner --no-acl --clean --if-exists < "$DUMP" || true
echo "Restaurado en $(( $(date +%s) - started )) s"

echo "== 3. Verificación"
status=0
DATABASE_URL="postgresql://test:test@127.0.0.1:${PORT}/${DB}" npx ts-node scripts/restore-drill.ts verify || status=$?

if [[ "${KEEP_RESTORE_DB:-0}" != "1" ]]; then
  docker exec "$CONTAINER" psql -U test -d postgres -qc "DROP DATABASE IF EXISTS $DB" >/dev/null
  echo "Base $DB borrada (KEEP_RESTORE_DB=1 para conservarla)."
fi
exit $status
