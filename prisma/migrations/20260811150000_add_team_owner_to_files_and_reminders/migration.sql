-- AlterTable
ALTER TABLE "TenantFile" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "TenantFileFolder" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "TenantReminder" ADD COLUMN     "teamId" TEXT;

-- CreateIndex
CREATE INDEX "TenantFile_teamId_idx" ON "TenantFile"("teamId");

-- CreateIndex
CREATE INDEX "TenantFileFolder_teamId_idx" ON "TenantFileFolder"("teamId");

-- CreateIndex
CREATE INDEX "TenantReminder_teamId_idx" ON "TenantReminder"("teamId");

-- AddForeignKey
ALTER TABLE "TenantFile" ADD CONSTRAINT "TenantFile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TenantTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFileFolder" ADD CONSTRAINT "TenantFileFolder_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TenantTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantReminder" ADD CONSTRAINT "TenantReminder_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TenantTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
