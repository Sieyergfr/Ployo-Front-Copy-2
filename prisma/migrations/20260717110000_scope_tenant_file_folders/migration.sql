-- AlterTable
ALTER TABLE "TenantFileFolder" ADD COLUMN "employeeId" TEXT;
ALTER TABLE "TenantFileFolder" ADD COLUMN "locationId" TEXT;
ALTER TABLE "TenantFileFolder" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'tenant';

-- Existing unique index was tenant/path only. It is replaced by tenant/scope/path.
DROP INDEX IF EXISTS "TenantFileFolder_tenantId_path_key";

-- CreateIndex
CREATE UNIQUE INDEX "TenantFileFolder_tenantId_scope_path_key" ON "TenantFileFolder"("tenantId", "scope", "path");

-- CreateIndex
CREATE INDEX "TenantFileFolder_employeeId_idx" ON "TenantFileFolder"("employeeId");

-- CreateIndex
CREATE INDEX "TenantFileFolder_locationId_idx" ON "TenantFileFolder"("locationId");
