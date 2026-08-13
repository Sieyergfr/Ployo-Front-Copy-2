/**
 * Cookie-Name für die Locale-Präferenz nicht angemeldeter Besucher (Login,
 * Registrierung, Marketing-/Legal-Seiten). Angemeldete Nutzer haben eine
 * DB-Präferenz (`UserPreference.language`, siehe lib/i18n.ts), die Vorrang
 * hat — der Cookie ist nur der Fallback davor bzw. für Seiten ohne Session.
 * Eigene Datei ohne "server-only", damit sowohl Server- (lib/i18n.ts) als
 * auch Client-Code (components/LocaleSwitcher.tsx) den Namen teilen können.
 */
export const LOCALE_COOKIE = "ployo-locale";
export const LOCALE_COOKIE_MAX_AGE_DAYS = 365;
