
-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "additionalEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "providers" ADD COLUMN     "additionalEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

