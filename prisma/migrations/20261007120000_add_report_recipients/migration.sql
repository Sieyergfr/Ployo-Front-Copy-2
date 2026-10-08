-- Stunden-Reports (app/(dashboard)/u/[tenant]/reports): gespeicherte
-- E-Mail-Empfaenger je Mandant. Rein additiv - neue Tabelle, keine
-- Aenderung an bestehenden Daten.

-- CreateTable
CREATE TABLE "TenantReportRecipient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantReportRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantReportRecipient_tenantId_idx" ON "TenantReportRecipient"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantReportRecipient_tenantId_email_key" ON "TenantReportRecipient"("tenantId", "email");

-- AddForeignKey
ALTER TABLE "TenantReportRecipient" ADD CONSTRAINT "TenantReportRecipient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
