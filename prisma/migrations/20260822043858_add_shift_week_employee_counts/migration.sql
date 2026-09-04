-- AlterTable
ALTER TABLE "TenantShiftWeek" ADD COLUMN "employeeShiftCountsJson" JSONB NOT NULL DEFAULT '{}';
