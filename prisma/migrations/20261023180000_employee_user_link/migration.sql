-- Mitarbeiter ↔ Konto: Einladung merkt sich die Personalakte, ein Konto hängt
-- pro Mandant an höchstens einer Akte, TenantEmployee.userId bekommt einen
-- echten Fremdschlüssel auf "user". Rein additiv.

-- Verknüpfungen auf nicht mehr existierende Konten lösen (Stand 2026-10-23:
-- 3 Akten in liegengebliebenen Test-Mandanten) — sonst scheitert der FK.
UPDATE "TenantEmployee" e
SET "userId" = NULL
WHERE e."userId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u."id" = e."userId");

-- AlterTable
ALTER TABLE "TenantInvitation" ADD COLUMN     "employeeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmployee_tenantId_userId_key" ON "TenantEmployee"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "TenantInvitation_employeeId_idx" ON "TenantInvitation"("employeeId");

-- AddForeignKey
ALTER TABLE "TenantInvitation" ADD CONSTRAINT "TenantInvitation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployee" ADD CONSTRAINT "TenantEmployee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
