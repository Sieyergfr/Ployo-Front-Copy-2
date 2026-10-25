-- AlterTable
ALTER TABLE "TenantEmployee" ADD COLUMN     "appAccessLockReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "appAccessLockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TenantPayrollStatement" ADD COLUMN     "firstViewedAt" TIMESTAMP(3);
