-- Envuelta en una transacción: si algo falla, Postgres deshace todo y no queda aplicada a medias
-- (Prisma no lo hace por su cuenta; ver OPERATIONS.md, "Cómo recuperarse de una migración fallida").
BEGIN;
-- AlterTable
ALTER TABLE "system_config"
  ADD COLUMN "exchangeAutoSync" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "exchangeSyncIntervalMinutes" INTEGER NOT NULL DEFAULT 480,
  ADD COLUMN "exchangeLastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "exchangeLastSyncAt" TIMESTAMP(3),
  ADD COLUMN "exchangeLastSyncError" TEXT;
COMMIT;
