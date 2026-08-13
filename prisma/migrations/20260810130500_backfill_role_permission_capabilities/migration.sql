-- Backfill: bestehende Rollen sollen beim Umstieg auf die granulare Matrix
-- keine Rechte unbemerkt verlieren. Die neuen Flags werden daher aus dem
-- bisherigen (einzigen) "level" jeder Zeile abgeleitet, statt bei false/NULL
-- zu bleiben.

-- canDelete galt bisher implizit ab "write" (siehe z. B. deleteTenantRole,
-- deleteTenantEmployee) — für alle Bereiche.
UPDATE "TenantRolePermission"
SET "canDelete" = "level" IN ('write', 'admin');

-- Datei-Fähigkeiten nur für die tatsächlich dateirelevanten Bereiche
-- (Personalakte-/Gehalts-Dokumente, Standort-Dokumente, Krankheits-Atteste —
-- siehe PermissionArea.fileRelevant in lib/roles.ts). Das eigenständige
-- "files"-Modul behält sein bestehendes level und wird hier nicht angefasst.
UPDATE "TenantRolePermission"
SET
  "canUploadFiles" = "level" IN ('write', 'admin'),
  "canEditFiles" = "level" IN ('write', 'admin'),
  "canViewFiles" = "level" IN ('read', 'write', 'admin')
WHERE "area" IN ('employees', 'payroll', 'locations', 'sickness');

-- canViewAudit war bisher ein einziges globales Recht pro Rolle (area =
-- 'audit'). Jetzt ist es pro Bereich gesetzt — beim Umstieg auf jeden
-- Bereich der Rolle übertragen, damit eine Rolle mit bisherigem
-- Audit-Leserecht nicht plötzlich nirgends mehr Audit-Trails sieht.
UPDATE "TenantRolePermission" AS target
SET "canViewAudit" = COALESCE(
  (
    SELECT audit_row."level" IN ('read', 'write', 'admin')
    FROM "TenantRolePermission" AS audit_row
    WHERE audit_row."roleId" = target."roleId"
      AND audit_row."area" = 'audit'
  ),
  false
);
