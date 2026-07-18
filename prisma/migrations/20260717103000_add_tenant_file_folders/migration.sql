-- CreateTable
CREATE TABLE "TenantFileFolder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL DEFAULT 'HR',
    "status" TEXT NOT NULL DEFAULT 'active',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TenantFileFolder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TenantFileFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TenantFileFolder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantFileFolder_tenantId_path_key" ON "TenantFileFolder"("tenantId", "path");

-- CreateIndex
CREATE INDEX "TenantFileFolder_tenantId_parentId_idx" ON "TenantFileFolder"("tenantId", "parentId");

-- CreateIndex
CREATE INDEX "TenantFileFolder_tenantId_status_idx" ON "TenantFileFolder"("tenantId", "status");
