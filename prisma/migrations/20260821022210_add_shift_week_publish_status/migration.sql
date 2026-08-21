-- CreateEnum
CREATE TYPE "ShiftWeekStatus" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "TenantShiftWeek" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "status" "ShiftWeekStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantShiftWeek_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantShiftWeek_tenantId_idx" ON "TenantShiftWeek"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantShiftWeek_tenantId_year_week_key" ON "TenantShiftWeek"("tenantId", "year", "week");

-- AddForeignKey
ALTER TABLE "TenantShiftWeek" ADD CONSTRAINT "TenantShiftWeek_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
