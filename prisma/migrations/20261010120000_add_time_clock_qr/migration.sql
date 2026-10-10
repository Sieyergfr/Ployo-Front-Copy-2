-- Stempel-QR-Codes je Standort: Einstellung "QR-Scan zum Ein-/Ausstempeln
-- in der App erforderlich", dauerhaftes Token je Standort und der beim
-- Stempeln gescannte Standort am Zeiteintrag. Rein additiv.

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN "timeTrackingQrRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TenantLocation" ADD COLUMN "clockQrToken" TEXT;

-- AlterTable
ALTER TABLE "TenantTimeEntry" ADD COLUMN "clockInLocationId" TEXT,
ADD COLUMN "clockInLocationName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "clockOutLocationId" TEXT,
ADD COLUMN "clockOutLocationName" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "TenantLocation_clockQrToken_key" ON "TenantLocation"("clockQrToken");

-- AddForeignKey
ALTER TABLE "TenantTimeEntry" ADD CONSTRAINT "TenantTimeEntry_clockInLocationId_fkey" FOREIGN KEY ("clockInLocationId") REFERENCES "TenantLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTimeEntry" ADD CONSTRAINT "TenantTimeEntry_clockOutLocationId_fkey" FOREIGN KEY ("clockOutLocationId") REFERENCES "TenantLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
