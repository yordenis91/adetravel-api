-- Envuelta en una transacción: si algo falla, Postgres deshace todo y no queda aplicada a medias
-- (Prisma no lo hace por su cuenta; ver OPERATIONS.md, "Cómo recuperarse de una migración fallida").
BEGIN;
-- AlterTable
ALTER TABLE "system_config"
  ADD COLUMN "termsOfServiceHtml" TEXT,
  ADD COLUMN "termsOfServiceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "privacyPolicyHtml" TEXT,
  ADD COLUMN "privacyPolicyUpdatedAt" TIMESTAMP(3);
COMMIT;
