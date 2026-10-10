-- QR-Scan-Pflicht fuers Ausstempeln getrennt vom Einstempeln einstellbar.
-- Rein additiv; Default aus = Ausstempeln per Knopf (bisheriges Verhalten).

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN "timeTrackingQrRequiredClockOut" BOOLEAN NOT NULL DEFAULT false;
