-- AlterTable
ALTER TABLE "TenantShiftWeek" ADD COLUMN "publishedShiftsJson" JSONB NOT NULL DEFAULT '[]';
