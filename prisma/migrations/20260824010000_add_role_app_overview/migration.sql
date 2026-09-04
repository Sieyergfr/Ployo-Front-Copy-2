-- Tab "Alles" der Mitarbeiter-App als eigenes Rollen-Flag.
--
-- Bewusst auf der Rolle statt an einem Bereich: der Tab bündelt Schichten,
-- Anträge und Abwesenheiten, ein Schichtplan-Leserecht allein soll damit noch
-- keinen Betriebsüberblick öffnen (das war bisher der Fall — jede Rolle mit
-- "shifts: read" sah ihn, also auch reguläre Mitarbeitende).
ALTER TABLE "TenantRole" ADD COLUMN "appOverviewEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Bestandsrollen: wer den Schichtplan schreiben darf, plant auch und behält
-- den Überblick — reine Leserollen verlieren ihn. Dieselbe Regel, mit der
-- lib/roles.ts die mitgelieferten Standardrollen vorbelegt.
UPDATE "TenantRole" AS r
SET "appOverviewEnabled" = true
WHERE EXISTS (
  SELECT 1
  FROM "TenantRolePermission" AS p
  WHERE p."roleId" = r."id"
    AND p."area" = 'shifts'
    AND p."level" IN ('write', 'admin')
);
