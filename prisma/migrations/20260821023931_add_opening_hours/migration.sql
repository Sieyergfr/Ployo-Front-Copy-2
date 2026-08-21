-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "defaultOpeningHoursJson" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "TenantLocation" ADD COLUMN     "openingHoursJson" JSONB NOT NULL DEFAULT '[]';
