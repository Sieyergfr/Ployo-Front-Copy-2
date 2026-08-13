-- Dark Mode wurde nie umgesetzt (kein CSS, keine Umschaltung außer dieser
-- toten Spalte) — Feature-Entscheidung: entfernen statt nachträglich bauen.
ALTER TABLE "UserPreference" DROP COLUMN "darkMode";
