-- AlterTable
ALTER TABLE "TenantSicknessReport" ADD COLUMN     "attachmentFileId" TEXT;

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "notifyShiftEvents" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyVacationEvents" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pushEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "TenantEmployeeNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantEmployeeNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantEmployeeNotification_tenantId_userId_read_idx" ON "TenantEmployeeNotification"("tenantId", "userId", "read");

-- CreateIndex
CREATE INDEX "TenantEmployeeNotification_tenantId_userId_createdAt_idx" ON "TenantEmployeeNotification"("tenantId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TenantSicknessReport" ADD CONSTRAINT "TenantSicknessReport_attachmentFileId_fkey" FOREIGN KEY ("attachmentFileId") REFERENCES "TenantFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployeeNotification" ADD CONSTRAINT "TenantEmployeeNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployeeNotification" ADD CONSTRAINT "TenantEmployeeNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
