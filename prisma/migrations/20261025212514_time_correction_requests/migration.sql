-- CreateTable
CREATE TABLE "TenantTimeCorrectionRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "timeEntryId" TEXT,
    "date" TEXT NOT NULL,
    "requestedStartTime" TEXT NOT NULL,
    "requestedEndTime" TEXT NOT NULL,
    "requestedBreakMinutes" INTEGER,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT NOT NULL DEFAULT '',
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantTimeCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantTimeCorrectionRequest_tenantId_status_idx" ON "TenantTimeCorrectionRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantTimeCorrectionRequest_employeeId_date_idx" ON "TenantTimeCorrectionRequest"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "TenantTimeCorrectionRequest" ADD CONSTRAINT "TenantTimeCorrectionRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTimeCorrectionRequest" ADD CONSTRAINT "TenantTimeCorrectionRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTimeCorrectionRequest" ADD CONSTRAINT "TenantTimeCorrectionRequest_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TenantTimeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
