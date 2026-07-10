-- CreateTable
CREATE TABLE "TenantShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "weekday" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 30,
    "team" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "conflict" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT,
    "locationId" TEXT,
    CONSTRAINT "TenantShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TenantShift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TenantShift_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "TenantLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantShift_tenantId_key_key" ON "TenantShift"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantShift_tenantId_idx" ON "TenantShift"("tenantId");

-- CreateIndex
CREATE INDEX "TenantShift_employeeId_idx" ON "TenantShift"("employeeId");

-- CreateIndex
CREATE INDEX "TenantShift_locationId_idx" ON "TenantShift"("locationId");

-- CreateIndex
CREATE INDEX "TenantShift_date_idx" ON "TenantShift"("date");
