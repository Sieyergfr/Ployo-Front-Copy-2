-- Einzelne Dateien und ganze Ordner einer Personalakte lassen sich vor dem
-- Mitarbeiter selbst verbergen: HR/Admin sehen sie unveraendert, die eigene
-- Akte (App-Tab "Meine Personalakte" und "Mein Bereich" im Web) laesst sie aus.
-- Ein verborgener Ordner verbirgt auch alles darunter.
ALTER TABLE "TenantFile" ADD COLUMN "hiddenFromEmployee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenantFileFolder" ADD COLUMN "hiddenFromEmployee" BOOLEAN NOT NULL DEFAULT false;
