-- AlterEnum
ALTER TYPE "EmployeeStatus" ADD VALUE 'former';

-- AlterTable
ALTER TABLE "TenantEmployee" ADD COLUMN     "endDate" TEXT NOT NULL DEFAULT '';
