-- CreateTable
CREATE TABLE "TenantShiftOffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "replacedEmployeeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantShiftOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantShiftOffer_tenantId_status_idx" ON "TenantShiftOffer"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TenantShiftOffer_shiftId_idx" ON "TenantShiftOffer"("shiftId");

-- CreateIndex
CREATE INDEX "TenantShiftOffer_employeeId_status_idx" ON "TenantShiftOffer"("employeeId", "status");

-- AddForeignKey
ALTER TABLE "TenantShiftOffer" ADD CONSTRAINT "TenantShiftOffer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantShiftOffer" ADD CONSTRAINT "TenantShiftOffer_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "TenantShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantShiftOffer" ADD CONSTRAINT "TenantShiftOffer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
