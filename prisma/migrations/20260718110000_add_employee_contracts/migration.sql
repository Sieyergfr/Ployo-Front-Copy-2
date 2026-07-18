-- CreateTable
CREATE TABLE "TenantEmployeeContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "contractType" TEXT NOT NULL DEFAULT 'Arbeitsvertrag',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL DEFAULT '',
    "probationEndDate" TEXT NOT NULL DEFAULT '',
    "noticePeriod" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "workLocation" TEXT NOT NULL DEFAULT '',
    "weeklyHours" TEXT NOT NULL DEFAULT '',
    "compensation" TEXT NOT NULL DEFAULT '',
    "vacationDays" INTEGER NOT NULL DEFAULT 0,
    "terminationDate" TEXT NOT NULL DEFAULT '',
    "terminationReason" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    CONSTRAINT "TenantEmployeeContract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TenantEmployeeContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TenantEmployeeContract_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "TenantFile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TenantEmployeeContract_fileId_key" ON "TenantEmployeeContract"("fileId");
CREATE INDEX "TenantEmployeeContract_tenantId_employeeId_status_idx" ON "TenantEmployeeContract"("tenantId", "employeeId", "status");
CREATE INDEX "TenantEmployeeContract_employeeId_startDate_idx" ON "TenantEmployeeContract"("employeeId", "startDate");
