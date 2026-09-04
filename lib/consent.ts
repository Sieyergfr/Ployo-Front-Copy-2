export const CONSENT_COOKIE = "ployo-consent";
export const CONSENT_MAX_AGE_DAYS = 180;

/**
 * Bei jeder inhaltlichen Änderung des Banner-Texts (components/CookieConsent.tsx)
 * erhöhen — die serverseitigen ConsentRecord-Einträge halten fest, unter
 * welcher Version zugestimmt wurde.
 */
export const CONSENT_BANNER_VERSION = "2026-09-03";

export type ConsentValue = "granted" | "denied";

export function parseConsentCookie(cookieString: string): ConsentValue | null {
  const match = cookieString.match(/(?:^|;\s*)ployo-consent=(granted|denied)/);
  return match ? (match[1] as ConsentValue) : null;
}
