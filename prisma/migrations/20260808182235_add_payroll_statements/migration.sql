/*
  Warnings:

  - You are about to drop the column `payrollStatementsJson` on the `TenantEmployee` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PayrollStatementStatus" AS ENUM ('available', 'corrected');

-- AlterTable
ALTER TABLE "TenantEmployee" DROP COLUMN "payrollStatementsJson";

-- CreateTable
CREATE TABLE "TenantPayrollStatement" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gross" TEXT NOT NULL DEFAULT '',
    "net" TEXT NOT NULL DEFAULT '',
    "status" "PayrollStatementStatus" NOT NULL DEFAULT 'available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "TenantPayrollStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantPayrollStatement_fileId_key" ON "TenantPayrollStatement"("fileId");

-- CreateIndex
CREATE INDEX "TenantPayrollStatement_tenantId_employeeId_idx" ON "TenantPayrollStatement"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "TenantPayrollStatement_employeeId_period_idx" ON "TenantPayrollStatement"("employeeId", "period");

-- AddForeignKey
ALTER TABLE "TenantPayrollStatement" ADD CONSTRAINT "TenantPayrollStatement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPayrollStatement" ADD CONSTRAINT "TenantPayrollStatement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPayrollStatement" ADD CONSTRAINT "TenantPayrollStatement_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "TenantFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
