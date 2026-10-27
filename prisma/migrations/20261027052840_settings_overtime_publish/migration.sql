-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "overtimeWarningPercent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "shiftNotifyOnPublish" BOOLEAN NOT NULL DEFAULT true;
