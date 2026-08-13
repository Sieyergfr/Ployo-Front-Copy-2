-- CreateTable
CREATE TABLE "TenantShiftTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entriesJson" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantShiftTemplate_tenantId_idx" ON "TenantShiftTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantShiftTemplate_tenantId_name_key" ON "TenantShiftTemplate"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "TenantShiftTemplate" ADD CONSTRAINT "TenantShiftTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
