-- CreateTable
CREATE TABLE "TenantEmployeeFolderTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantEmployeeFolderTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantEmployeeFolderTemplate_tenantId_idx" ON "TenantEmployeeFolderTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmployeeFolderTemplate_tenantId_name_key" ON "TenantEmployeeFolderTemplate"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "TenantEmployeeFolderTemplate" ADD CONSTRAINT "TenantEmployeeFolderTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
