-- Neue Berechtigungsbereiche "contracts" (Verträge), "sensitiveData"
-- (Sensible Daten: Geburtsdatum/-ort, Nationalität, Familienstand,
-- Privatadresse, Steuer-ID, SV-Nummer, Krankenkasse, IBAN) und
-- "employeeFiles" (Dateien der Personalakte). "TenantRolePermission.area"
-- ist eine freie String-Spalte -- keine Schema-Änderung nötig, nur diese
-- Backfill-Migration, damit bestehende Rollen beim Umstieg keinen Zugriff
-- verlieren, den sie heute effektiv haben (siehe lib/roles.ts,
-- lib/tenant-access.ts für die App-seitige Ergänzung dieser Bereiche).

-- "contracts" und "sensitiveData": 1:1 Kopie der bisherigen "payroll"-Zeile
-- je Rolle -- der Bereich "payroll" regelte bisher Verträge, Gehalt UND
-- sensible Stammdaten gemeinsam; seine Bedeutung verengt sich ab jetzt auf
-- ausschließlich Lohnabrechnungen.
INSERT INTO "TenantRolePermission"
  ("id", "roleId", "area", "level", "scope", "canDelete", "canUploadFiles", "canEditFiles", "canViewFiles", "canViewAudit", "shiftsLevel", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  "roleId",
  'contracts',
  "level",
  "scope",
  "canDelete",
  "canUploadFiles",
  "canEditFiles",
  "canViewFiles",
  "canViewAudit",
  NULL,
  now(),
  now()
FROM "TenantRolePermission"
WHERE "area" = 'payroll'
ON CONFLICT ("roleId", "area") DO NOTHING;

INSERT INTO "TenantRolePermission"
  ("id", "roleId", "area", "level", "scope", "canDelete", "canUploadFiles", "canEditFiles", "canViewFiles", "canViewAudit", "shiftsLevel", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  "roleId",
  'sensitiveData',
  "level",
  "scope",
  "canDelete",
  "canUploadFiles",
  "canEditFiles",
  "canViewFiles",
  "canViewAudit",
  NULL,
  now(),
  now()
FROM "TenantRolePermission"
WHERE "area" = 'payroll'
ON CONFLICT ("roleId", "area") DO NOTHING;

-- "employeeFiles": Level aus den heute schon genutzten Datei-Fähigkeiten der
-- "employees"-Zeile ableiten (canUploadFiles/canEditFiles -> write,
-- canViewFiles -> read, sonst none) -- das ist der tatsächliche heutige
-- Effektiv-Zugriff auf Mitarbeiter-Dateien, nicht "payroll".
INSERT INTO "TenantRolePermission"
  ("id", "roleId", "area", "level", "scope", "canDelete", "canUploadFiles", "canEditFiles", "canViewFiles", "canViewAudit", "shiftsLevel", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  "roleId",
  'employeeFiles',
  CASE
    WHEN "canUploadFiles" OR "canEditFiles" THEN 'write'::"PermissionLevel"
    WHEN "canViewFiles" THEN 'read'::"PermissionLevel"
    ELSE 'none'::"PermissionLevel"
  END,
  "scope",
  "canDelete",
  "canUploadFiles",
  "canEditFiles",
  "canViewFiles",
  false,
  NULL,
  now(),
  now()
FROM "TenantRolePermission"
WHERE "area" = 'employees'
ON CONFLICT ("roleId", "area") DO NOTHING;
