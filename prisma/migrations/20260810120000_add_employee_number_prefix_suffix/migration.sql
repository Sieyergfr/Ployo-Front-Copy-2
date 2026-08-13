-- AlterTable: default 'MA-' preserves the existing hardcoded prefix for
-- every current tenant, so nextEmployeeNumber() keeps producing the same
-- format until an owner explicitly changes it in Einstellungen.
ALTER TABLE "TenantSettings" ADD COLUMN "employeeNumberPrefix" TEXT NOT NULL DEFAULT 'MA-';
ALTER TABLE "TenantSettings" ADD COLUMN "employeeNumberSuffix" TEXT NOT NULL DEFAULT '';
