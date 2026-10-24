-- Datenmodell-Lücken Phase 3+4: echte Fremdschlüssel für Team-/Standort-
-- Mitgliedschaften (Cascade beim Löschen der Personalakte), TenantShift.teamId
-- neben dem Anzeige-Text `team`, TenantFileFolder.templateId für Ordner aus
-- Ordnervorlagen. Rein additiv; Stand 2026-10-23 keine verwaisten
-- Mitgliedschaften.

-- AlterTable
ALTER TABLE "TenantFileFolder" ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "TenantShift" ADD COLUMN     "teamId" TEXT;

-- CreateIndex
CREATE INDEX "TenantFileFolder_templateId_idx" ON "TenantFileFolder"("templateId");

-- CreateIndex
CREATE INDEX "TenantShift_teamId_idx" ON "TenantShift"("teamId");

-- AddForeignKey
ALTER TABLE "TenantTeamMember" ADD CONSTRAINT "TenantTeamMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLocationMember" ADD CONSTRAINT "TenantLocationMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFileFolder" ADD CONSTRAINT "TenantFileFolder_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TenantEmployeeFolderTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantShift" ADD CONSTRAINT "TenantShift_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TenantTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: Schichten über den Teamnamen im selben Mandanten. Namen ohne
-- passendes Team (Stand 2026-10-23: 1 Schicht) bleiben ohne teamId.
UPDATE "TenantShift" s
SET "teamId" = t."id"
FROM "TenantTeam" t
WHERE s."team" <> ''
  AND t."tenantId" = s."tenantId"
  AND t."name" = s."team";

-- Backfill: Top-Level-Ordner einer Personalakte mit dem Namen einer
-- Ordnervorlage desselben Mandanten stammen aus dieser Vorlage.
UPDATE "TenantFileFolder" f
SET "templateId" = tpl."id"
FROM "TenantEmployeeFolderTemplate" tpl
WHERE f."employeeId" IS NOT NULL
  AND f."parentId" IS NULL
  AND tpl."tenantId" = f."tenantId"
  AND tpl."name" = f."name";
