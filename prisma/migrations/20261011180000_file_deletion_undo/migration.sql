-- Löschen von Dateien/Ordnern 24 h lang rückgängig machbar (Lösch-Batch je
-- Nutzeraktion). Rein additiv.

-- AlterTable
ALTER TABLE "TenantFile" ADD COLUMN     "deletedByName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "deletionBatchId" TEXT;

-- AlterTable
ALTER TABLE "TenantFileFolder" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "deletionBatchId" TEXT;

-- CreateIndex
CREATE INDEX "TenantFile_tenantId_deletionBatchId_idx" ON "TenantFile"("tenantId", "deletionBatchId");

-- CreateIndex
CREATE INDEX "TenantFileFolder_tenantId_deletionBatchId_idx" ON "TenantFileFolder"("tenantId", "deletionBatchId");

