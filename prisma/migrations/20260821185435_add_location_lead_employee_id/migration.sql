-- AlterTable
ALTER TABLE "TenantLocation" ADD COLUMN "leadEmployeeId" TEXT;

-- CreateIndex
CREATE INDEX "TenantLocation_leadEmployeeId_idx" ON "TenantLocation"("leadEmployeeId");

-- AddForeignKey
ALTER TABLE "TenantLocation" ADD CONSTRAINT "TenantLocation_leadEmployeeId_fkey" FOREIGN KEY ("leadEmployeeId") REFERENCES "TenantEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
