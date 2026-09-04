import "server-only";
import { decryptField, encryptField } from "@/lib/encryption";

/**
 * Kurzlebiges Zugriffstoken für den Datei-Stream (`.../files/[fileId]/content`).
 *
 * Hintergrund: Gehaltsabrechnungen und andere sensible Dokumente wurden
 * bisher über eine vorsignierte S3-URL ausgeliefert. Die ist zwar zeitlich
 * begrenzt, aber währenddessen für jeden aufrufbar, der den Link hat — und
 * sie zeigt zusätzlich Bucket und Objektschlüssel. Der Stream-Weg gibt die
 * Speicher-URL nie heraus.
 *
 * Für den Browser reicht dort der Session-Cookie. Die Mobile-App kann aber
 * beim Öffnen einer PDF-Vorschau keinen Cookie mitgeben (der System-Browser
 * teilt den Cookie-Jar der App nicht), deshalb dieses Token: an genau eine
 * Datei und genau einen Nutzer gebunden, wenige Minuten gültig, per
 * AES-256-GCM signiert und verschlüsselt (siehe lib/encryption.ts) — es lässt
 * sich also weder fälschen noch auf eine andere Datei umbiegen.
 */

const DEFAULT_TTL_SECONDS = 120;

type FileAccessTokenPayload = {
  /** Datei-ID (TenantFile.id). */
  f: string;
  /** Nutzer, für den das Token ausgestellt wurde. */
  u: string;
  /** Mandanten-Slug — verhindert die Wiederverwendung über Mandanten hinweg. */
  t: string;
  /** Ablauf als Unix-Zeit in Sekunden. */
  e: number;
};

export function createFileAccessToken(input: {
  fileId: string;
  userId: string;
  tenantSlug: string;
  ttlSeconds?: number;
}) {
  const payload: FileAccessTokenPayload = {
    f: input.fileId,
    u: input.userId,
    t: input.tenantSlug,
    e: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  };

  return encryptField(JSON.stringify(payload));
}

/**
 * Prüft ein Token gegen Datei + Mandant. Liefert die Nutzer-ID, für die es
 * ausgestellt wurde — die Route setzt darauf ihre normale Rechteprüfung auf,
 * das Token allein berechtigt zu nichts.
 */
export function readFileAccessToken(input: {
  token: string;
  fileId: string;
  tenantSlug: string;
}): { userId: string } | null {
  const decrypted = decryptField(input.token);

  if (!decrypted || decrypted === input.token) {
    return null;
  }

  let payload: FileAccessTokenPayload;

  try {
    payload = JSON.parse(decrypted) as FileAccessTokenPayload;
  } catch {
    return null;
  }

  if (
    payload.f !== input.fileId ||
    payload.t !== input.tenantSlug ||
    typeof payload.u !== "string" ||
    typeof payload.e !== "number" ||
    payload.e < Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return { userId: payload.u };
}
