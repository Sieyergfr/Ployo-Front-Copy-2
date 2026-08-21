-- AlterTable
ALTER TABLE "TenantEmployeeNotification" ADD COLUMN     "entityType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "entityId" TEXT NOT NULL DEFAULT '';
