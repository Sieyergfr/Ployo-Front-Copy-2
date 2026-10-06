-- Zeiterfassung (Stempeluhr): Einstellungen je Mandant, gestempelte
-- Arbeitsbloecke + Pausen, Versandprotokoll der Stempel-Erinnerungen
-- (lib/time-tracking-service.ts, app/api/cron/time-tracking).
--
-- Neuer Berechtigungsbereich "timeTracking" (lib/roles.ts,
-- lib/tenant-access.ts) fuer die Verwaltungssicht. "TenantRolePermission.area"
-- ist eine freie String-Spalte; eine fehlende Zeile gilt als "none". Damit
-- bestehende System-Rollen sich wie neu angelegte verhalten, werden sie unten
-- auf die Defaults aus `defaultPermissionRoles` nachgezogen. Die eigenen
-- Zeiten sieht jeder Mitarbeiter ohnehin ueber den Self-Service.

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "timeTrackingAutoBreakDeduction" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timeTrackingAutoClockOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timeTrackingAutoClockOutAfterShiftMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "timeTrackingAutoClockOutMaxHours" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "timeTrackingBreaksEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "timeTrackingClockInLeadMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "timeTrackingClockInMode" TEXT NOT NULL DEFAULT 'always',
ADD COLUMN     "timeTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timeTrackingReminderPush" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "TenantTimeEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "clockInAt" TIMESTAMP(3) NOT NULL,
    "clockOutAt" TIMESTAMP(3),
    "shiftId" TEXT NOT NULL DEFAULT '',
    "plannedStartAt" TIMESTAMP(3),
    "plannedEndAt" TIMESTAMP(3),
    "shiftLocation" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'app',
    "autoClosed" BOOLEAN NOT NULL DEFAULT false,
    "breakMinutesOverride" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "correctedAt" TIMESTAMP(3),
    "correctedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantTimeBreak" (
    "id" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantTimeBreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantTimeClockReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftRef" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantTimeClockReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantTimeEntry_tenantId_clockInAt_idx" ON "TenantTimeEntry"("tenantId", "clockInAt");

-- CreateIndex
CREATE INDEX "TenantTimeEntry_employeeId_clockInAt_idx" ON "TenantTimeEntry"("employeeId", "clockInAt");

-- CreateIndex
CREATE INDEX "TenantTimeBreak_timeEntryId_idx" ON "TenantTimeBreak"("timeEntryId");

-- CreateIndex
CREATE INDEX "TenantTimeClockReminder_createdAt_idx" ON "TenantTimeClockReminder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantTimeClockReminder_tenantId_shiftRef_kind_key" ON "TenantTimeClockReminder"("tenantId", "shiftRef", "kind");

-- AddForeignKey
ALTER TABLE "TenantTimeEntry" ADD CONSTRAINT "TenantTimeEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTimeEntry" ADD CONSTRAINT "TenantTimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TenantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTimeBreak" ADD CONSTRAINT "TenantTimeBreak_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TenantTimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTimeClockReminder" ADD CONSTRAINT "TenantTimeClockReminder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill "timeTracking" fuer bestehende System-Rollen (Werte = lib/roles.ts,
-- canDelete/canViewAudit wie deriveCapabilitiesFromLevels: ab "write" bzw.
-- wenn die Rolle "audit" lesen darf).
INSERT INTO "TenantRolePermission"
  ("id", "roleId", "area", "level", "scope", "canDelete", "canUploadFiles", "canEditFiles", "canViewFiles", "canViewAudit", "shiftsLevel", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  r."id",
  'timeTracking',
  CASE r."key"
    WHEN 'hr-lead' THEN 'admin'::"PermissionLevel"
    WHEN 'payroll' THEN 'read'::"PermissionLevel"
    WHEN 'teamlead' THEN 'write'::"PermissionLevel"
  END,
  CASE r."key"
    WHEN 'teamlead' THEN 'team'::"PermissionScope"
    ELSE 'all'::"PermissionScope"
  END,
  r."key" IN ('hr-lead', 'teamlead'),
  false,
  false,
  false,
  r."key" IN ('hr-lead', 'payroll'),
  NULL,
  now(),
  now()
FROM "TenantRole" r
WHERE r."isSystem" = true AND r."key" IN ('hr-lead', 'payroll', 'teamlead')
ON CONFLICT ("roleId", "area") DO NOTHING;
