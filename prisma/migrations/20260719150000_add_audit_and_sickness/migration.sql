CREATE TABLE "TenantSicknessReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'open',
    "certificateStatus" TEXT NOT NULL DEFAULT 'pending',
    "reportChannel" TEXT NOT NULL DEFAULT 'app',
    "note" TEXT NOT NULL DEFAULT '',
    "reportedById" TEXT NOT NULL DEFAULT '',
    "reportedByName" TEXT NOT NULL DEFAULT '',
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TenantSicknessReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TenantSicknessReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TenantSicknessReport_tenantId_status_idx" ON "TenantSicknessReport"("tenantId", "status");
CREATE INDEX "TenantSicknessReport_tenantId_startDate_idx" ON "TenantSicknessReport"("tenantId", "startDate");
CREATE INDEX "TenantSicknessReport_employeeId_idx" ON "TenantSicknessReport"("employeeId");

CREATE TABLE "TenantAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL DEFAULT '',
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TenantAuditLog_tenantId_createdAt_idx" ON "TenantAuditLog"("tenantId", "createdAt");
CREATE INDEX "TenantAuditLog_tenantId_entityType_entityId_createdAt_idx" ON "TenantAuditLog"("tenantId", "entityType", "entityId", "createdAt");
CREATE INDEX "TenantAuditLog_actorId_idx" ON "TenantAuditLog"("actorId");
