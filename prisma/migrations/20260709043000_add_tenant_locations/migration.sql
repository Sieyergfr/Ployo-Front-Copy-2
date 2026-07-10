-- CreateTable
CREATE TABLE "TenantLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "activeToday" INTEGER NOT NULL DEFAULT 0,
    "shiftCount" INTEGER NOT NULL DEFAULT 0,
    "openPositions" INTEGER NOT NULL DEFAULT 0,
    "utilization" TEXT NOT NULL DEFAULT '0%',
    "utilizationCaption" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "accentClassName" TEXT NOT NULL DEFAULT 'bg-ink',
    "leadInitials" TEXT NOT NULL DEFAULT '--',
    "leadName" TEXT NOT NULL DEFAULT 'Keine Leitung',
    "leadPhone" TEXT NOT NULL DEFAULT '',
    "leadEmail" TEXT NOT NULL DEFAULT '',
    "teamJson" TEXT NOT NULL DEFAULT '[]',
    "activityJson" TEXT NOT NULL DEFAULT '[]',
    "fileFoldersJson" TEXT NOT NULL DEFAULT '[]',
    "filesJson" TEXT NOT NULL DEFAULT '[]',
    "shiftPlanJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "TenantLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TenantLocation_tenantId_idx" ON "TenantLocation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantLocation_tenantId_key_key" ON "TenantLocation"("tenantId", "key");
