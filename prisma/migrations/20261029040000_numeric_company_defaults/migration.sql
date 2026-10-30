-- Bestehende Angaben wie "40 Stunden pro Woche" in einen Rechenwert übernehmen.
ALTER TABLE "TenantSettings" ALTER COLUMN "workHours" DROP DEFAULT;
ALTER TABLE "TenantSettings" ALTER COLUMN "workHours" TYPE DOUBLE PRECISION
USING LEAST(168, GREATEST(0, COALESCE((regexp_match(replace("workHours", ',', '.'), '([0-9]+(?:[.][0-9]+)?)'))[1]::double precision, 40)));
ALTER TABLE "TenantSettings" ALTER COLUMN "workHours" SET DEFAULT 40;
ALTER TABLE "TenantSettings" ALTER COLUMN "vacationDays" SET DEFAULT 24;
UPDATE "TenantSettings" SET "employeeNumberRequired" = true WHERE NOT "employeeNumberRequired";
