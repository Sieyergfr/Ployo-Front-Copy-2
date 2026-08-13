export const CONSENT_COOKIE = "ployo-consent";
export const CONSENT_MAX_AGE_DAYS = 180;

export type ConsentValue = "granted" | "denied";

export function parseConsentCookie(cookieString: string): ConsentValue | null {
  const match = cookieString.match(/(?:^|;\s*)ployo-consent=(granted|denied)/);
  return match ? (match[1] as ConsentValue) : null;
}
