import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { decryptField, encryptField } from "@/lib/encryption";

/**
 * Hashing für die 6-stellige Ordner-PIN (Dateiablage). Eigenständig von
 * `encryption.ts` (das verschlüsselt reversibel, hier reicht ein
 * Einweg-Hash wie bei Passwörtern) — Format `<saltHex>:<hashHex>`.
 */

const UNLOCK_COOKIE = "ployo-folder-unlock";
const UNLOCK_MAX_AGE_SECONDS = 60 * 60 * 8;

function folderUnlockKey(tenantSlug: string, folderPath: string) {
  return `${tenantSlug}:${folderPath}`;
}

/** Liest die per Cookie freigeschalteten Ordner (AES-GCM-verschlüsselt — manipulierte Werte fallen auf "keine Freischaltung" zurück). */
async function getUnlockedFolderKeys(): Promise<string[]> {
  const raw = (await cookies()).get(UNLOCK_COOKIE)?.value;

  if (!raw) {
    return [];
  }

  try {
    const decrypted = decryptField(raw);
    const parsed: unknown = decrypted ? JSON.parse(decrypted) : [];

    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export async function isFolderUnlocked(tenantSlug: string, folderPath: string) {
  const keys = await getUnlockedFolderKeys();

  return keys.includes(folderUnlockKey(tenantSlug, folderPath));
}

/** Merkt sich per Session-Cookie, dass die PIN für diesen Ordner bereits korrekt eingegeben wurde. */
export async function markFolderUnlocked(tenantSlug: string, folderPath: string) {
  const keys = await getUnlockedFolderKeys();
  const key = folderUnlockKey(tenantSlug, folderPath);
  const nextKeys = keys.includes(key) ? keys : [...keys, key];

  (await cookies()).set(UNLOCK_COOKIE, encryptField(JSON.stringify(nextKeys)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: UNLOCK_MAX_AGE_SECONDS,
  });
}

export function hashFolderPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);

  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyFolderPin(pin: string, storedHash: string): boolean {
  const [saltHex, hashHex] = storedHash.split(":");

  if (!saltHex || !hashHex) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(pin, salt, expected.length);

    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
