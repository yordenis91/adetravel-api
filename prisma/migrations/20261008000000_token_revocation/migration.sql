-- Envuelta en una transacción: si algo falla, Postgres deshace todo y no queda aplicada a medias
-- (Prisma no lo hace por su cuenta; ver OPERATIONS.md, "Cómo recuperarse de una migración fallida").
BEGIN;
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "revoked_tokens" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "revoked_tokens_expiresAt_idx" ON "revoked_tokens"("expiresAt");

COMMIT;
