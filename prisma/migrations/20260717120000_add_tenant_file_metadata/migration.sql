-- AlterTable
ALTER TABLE "TenantFile" ADD COLUMN "uploadedById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TenantFile" ADD COLUMN "uploadedByName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TenantFile" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'Sonstiges';
ALTER TABLE "TenantFile" ADD COLUMN "validFrom" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TenantFile" ADD COLUMN "expiresAt" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TenantFile" ADD COLUMN "reminderAt" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TenantFile" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TenantFile" ADD COLUMN "tagsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "TenantFile" ADD COLUMN "assignedEmployeeId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TenantFile" ADD COLUMN "assignedEmployeeName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TenantFile" ADD COLUMN "assignedLocationId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TenantFile" ADD COLUMN "assignedLocationName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TenantFile" ADD COLUMN "accessRoleIdsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "TenantFile" ADD COLUMN "accessRoleNamesJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "TenantFile" ADD COLUMN "accessUserIdsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "TenantFile" ADD COLUMN "accessUserNamesJson" TEXT NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "TenantFile_assignedEmployeeId_idx" ON "TenantFile"("assignedEmployeeId");

-- CreateIndex
CREATE INDEX "TenantFile_assignedLocationId_idx" ON "TenantFile"("assignedLocationId");
