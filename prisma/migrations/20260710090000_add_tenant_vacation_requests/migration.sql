-- CreateTable
CREATE TABLE "TenantVacationRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT NOT NULL DEFAULT '',
    "decidedAt" DATETIME,
    "decidedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    CONSTRAINT "TenantVacationRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TenantVacationRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantVacationRequest_tenantId_key_key" ON "TenantVacationRequest"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantVacationRequest_tenantId_idx" ON "TenantVacationRequest"("tenantId");

-- CreateIndex
CREATE INDEX "TenantVacationRequest_employeeId_idx" ON "TenantVacationRequest"("employeeId");

-- CreateIndex
CREATE INDEX "TenantVacationRequest_status_idx" ON "TenantVacationRequest"("status");
