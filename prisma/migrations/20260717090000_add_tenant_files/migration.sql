-- CreateTable
CREATE TABLE "TenantFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT,
    "locationId" TEXT,
    "parentId" TEXT,
    "bucket" TEXT NOT NULL DEFAULT 'hr-documents',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "extension" TEXT NOT NULL DEFAULT '',
    "folderSlug" TEXT NOT NULL DEFAULT 'allgemein',
    "folderName" TEXT NOT NULL DEFAULT 'Allgemein',
    "ownerName" TEXT NOT NULL DEFAULT 'HR',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL DEFAULT 's3',
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TenantFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TenantFile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TenantFile_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "TenantLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TenantFile_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TenantFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TenantFile_tenantId_status_idx" ON "TenantFile"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantFile_tenantId_folderSlug_idx" ON "TenantFile"("tenantId", "folderSlug");

-- CreateIndex
CREATE INDEX "TenantFile_employeeId_idx" ON "TenantFile"("employeeId");

-- CreateIndex
CREATE INDEX "TenantFile_locationId_idx" ON "TenantFile"("locationId");

-- CreateIndex
CREATE INDEX "TenantFile_parentId_idx" ON "TenantFile"("parentId");

-- CreateIndex
CREATE INDEX "TenantFile_bucket_storageKey_idx" ON "TenantFile"("bucket", "storageKey");
