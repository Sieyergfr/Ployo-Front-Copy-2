/** Kategorien der Einstellungsseite (auch serverseitig nutzbar, daher kein Client-Modul). */
export const SETTINGS_CATEGORIES = [
  "account",
  "company",
  "security",
  "timeTracking",
  "shifts",
  "notifications",
  "billing",
  "integrations",
] as const;
export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];
