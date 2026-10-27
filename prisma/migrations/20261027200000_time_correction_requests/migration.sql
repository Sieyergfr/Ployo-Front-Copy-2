-- CreateTable
CREATE TABLE "TenantTimeCorrectionRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "timeEntryId" TEXT,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "rejectReason" TEXT NOT NULL DEFAULT '',
    "decidedBy" TEXT NOT NULL DEFAULT '',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantTimeCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantTimeCorrectionRequest_tenantId_status_createdAt_idx" ON "TenantTimeCorrectionRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TenantTimeCorrectionRequest_employeeId_createdAt_idx" ON "TenantTimeCorrectionRequest"("employeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "TenantTimeCorrectionRequest" ADD CONSTRAINT "TenantTimeCorrectionRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTimeCorrectionRequest" ADD CONSTRAINT "TenantTimeCorrectionRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTimeCorrectionRequest" ADD CONSTRAINT "TenantTimeCorrectionRequest_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TenantTimeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

