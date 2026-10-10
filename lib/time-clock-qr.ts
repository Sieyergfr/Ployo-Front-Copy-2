import { randomBytes } from "node:crypto";

/**
 * Stempel-QR-Codes der Standorte (Zeiterfassung, Einstellung
 * "QR-Scan erforderlich").
 *
 * Der QR-Code enthält eine normale URL `<BETTER_AUTH_URL>/stempeln/<token>`:
 * Die App liest daraus das Token und schickt den gescannten Text beim
 * Einstempeln mit; wer ihn versehentlich mit der Handykamera öffnet,
 * landet auf einer Hinweisseite (app/stempeln/[token]) statt auf einem
 * Fehler. Das Token ist zufällig (192 Bit) und verrät weder Mandant noch
 * Standort — die Zuordnung passiert ausschließlich serverseitig, immer
 * beschränkt auf den Mandanten des Stempelnden.
 */

export const CLOCK_QR_PATH = "/stempeln";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const URL_TOKEN_PATTERN = /\/stempeln\/([A-Za-z0-9_-]{32})\/?(?:[?#].*)?$/;

/** Gescannte Texte länger als das werden gar nicht erst ausgewertet. */
export const CLOCK_QR_MAX_LENGTH = 512;

export function generateClockQrToken(): string {
  return randomBytes(24).toString("base64url");
}

export function clockQrPayload(token: string, baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000") {
  return `${baseUrl.replace(/\/+$/, "")}${CLOCK_QR_PATH}/${token}`;
}

export function isClockQrToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/**
 * Token aus dem gescannten Text — akzeptiert die URL (egal welcher Host,
 * damit ein Domainwechsel alte Ausdrucke nicht ungültig macht) oder das
 * nackte Token. `null` für alles andere.
 */
export function parseClockQrToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const value = raw.trim();
  if (!value || value.length > CLOCK_QR_MAX_LENGTH) return null;
  if (TOKEN_PATTERN.test(value)) return value;

  return URL_TOKEN_PATTERN.exec(value)?.[1] ?? null;
}
