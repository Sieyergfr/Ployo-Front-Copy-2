-- Mutterschutz-Kennzeichnung (§ 5/§ 6 MuSchG). Neuer, eigener
-- Berechtigungsbereich "mutterschutz" (lib/roles.ts, lib/tenant-access.ts)
-- -- braucht KEINEN Backfill hier: "TenantRolePermission.area" ist eine
-- freie String-Spalte, und eine fehlende Zeile für einen Bereich löst die
-- App-Logik bereits sicher zu "none" auf (lib/tenant-access.ts,
-- computePermissionCapabilities: `level: permission?.level ?? "none"`).
-- Anders als beim Aufsplitten von "payroll" (Migration
-- 20260904180000_add_employee_permission_subareas) gibt es hier keine
-- bestehende Berechtigung, die migriert werden müsste -- das ist eine
-- komplett neue Fähigkeit, die niemand vorher hatte.

-- CreateEnum-Äquivalent entfällt (area ist String, level/scope bestehende Enums).

-- AlterTable
ALTER TABLE "TenantEmployee"
  ADD COLUMN "maternityProtectionActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maternityProtectionNote" TEXT NOT NULL DEFAULT '';
