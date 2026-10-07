-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('GRANT', 'DENY');

-- AlterTable
ALTER TABLE "user_permissions" ADD COLUMN     "effect" "PermissionEffect" NOT NULL DEFAULT 'GRANT';
