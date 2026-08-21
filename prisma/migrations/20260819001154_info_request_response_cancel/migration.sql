-- AlterEnum: neuer Terminal-Status, um eine Info-Anfrage abzubrechen, ohne
-- sie zu löschen (Audit-Trail bleibt erhalten).
ALTER TYPE "InfoRequestStatus" ADD VALUE 'cancelled';

-- AlterTable: Antwort-Feld für die Mitarbeiter-Selbstauskunft (Text und/oder
-- verknüpfte Datei), damit "Datei gewünscht" tatsächlich eine Antwort tragen
-- kann statt nur eine reine Statusanzeige zu sein.
ALTER TABLE "TenantEmployeeInfoRequest" ADD COLUMN     "responseMessage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TenantEmployeeInfoRequest" ADD COLUMN     "respondedAt" TIMESTAMP(3);
ALTER TABLE "TenantEmployeeInfoRequest" ADD COLUMN     "responseFileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TenantEmployeeInfoRequest_responseFileId_key" ON "TenantEmployeeInfoRequest"("responseFileId");

-- AddForeignKey
ALTER TABLE "TenantEmployeeInfoRequest" ADD CONSTRAINT "TenantEmployeeInfoRequest_responseFileId_fkey" FOREIGN KEY ("responseFileId") REFERENCES "TenantFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
