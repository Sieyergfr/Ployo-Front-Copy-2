-- AlterEnum: neuer Scope-Wert für die "assigned"-Sichtbarkeit (Standorte:
-- eigener Standort per Namensabgleich; Teams: eigene Teammitgliedschaften).
-- Wird in dieser Migration selbst noch nicht verwendet (siehe Postgres-
-- Einschränkung zu ALTER TYPE ... ADD VALUE innerhalb derselben Transaktion).
ALTER TYPE "PermissionScope" ADD VALUE 'assigned';

-- AlterTable: granulare Fähigkeiten pro Rolle und Bereich, zusätzlich zum
-- bisherigen level/scope. Defaults sind bewusst restriktiv (false/NULL) —
-- die nachfolgende Backfill-Migration leitet die tatsächlichen Werte für
-- bestehende Rollen aus ihrem bisherigen level ab, statt sie hier pauschal
-- zu setzen.
ALTER TABLE "TenantRolePermission" ADD COLUMN "canDelete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenantRolePermission" ADD COLUMN "canUploadFiles" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenantRolePermission" ADD COLUMN "canEditFiles" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenantRolePermission" ADD COLUMN "canViewFiles" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenantRolePermission" ADD COLUMN "canViewAudit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenantRolePermission" ADD COLUMN "shiftsLevel" "PermissionLevel";
