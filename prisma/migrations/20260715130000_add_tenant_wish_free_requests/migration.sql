-- CreateTable
CREATE TABLE "TenantWishFreeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reason" TEXT NOT NULL DEFAULT '',
    "rejectReason" TEXT NOT NULL DEFAULT '',
    "decidedAt" DATETIME,
    "decidedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    CONSTRAINT "TenantWishFreeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TenantWishFreeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantWishFreeRequest_tenantId_key_key" ON "TenantWishFreeRequest"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantWishFreeRequest_tenantId_idx" ON "TenantWishFreeRequest"("tenantId");

-- CreateIndex
CREATE INDEX "TenantWishFreeRequest_employeeId_idx" ON "TenantWishFreeRequest"("employeeId");

-- CreateIndex
CREATE INDEX "TenantWishFreeRequest_date_idx" ON "TenantWishFreeRequest"("date");

-- CreateIndex
CREATE INDEX "TenantWishFreeRequest_status_idx" ON "TenantWishFreeRequest"("status");
