import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Hashing für die 6-stellige Ordner-PIN (Dateiablage). Eigenständig von
 * `encryption.ts` (das verschlüsselt reversibel, hier reicht ein
 * Einweg-Hash wie bei Passwörtern) — Format `<saltHex>:<hashHex>`.
 */

const UNLOCK_COOKIE = "ployo-folder-unlock";
const UNLOCK_MAX_AGE_SECONDS = 60 * 60 * 8;
const isProductionRuntime = process.env.NODE_ENV === "production";

/**
 * `scope` unterscheidet Ordner mit identischem `path` in unterschiedlichen
 * Eigentümer-Ablagen (z. B. der "vertraege"-Ordner zweier verschiedener
 * Mitarbeiter) — ohne das würde das Freischalten eines Ordners versehentlich
 * jeden anderen Ordner mit demselben Pfadnamen mit freischalten.
 */
function folderUnlockKey(tenantSlug: string, scope: string, folderPath: string) {
  return `${tenantSlug}:${scope}:${folderPath}`;
}

/**
 * Eigener, strikt authentifizierender Token statt der allgemeinen
 * `encryptField`/`decryptField` (die bewusst einen Klartext-Fallback für
 * unverschlüsselte Alt-Datensätze in der DB haben). Für einen
 * Sicherheits-Cookie ist dieser Fallback falsch: ein nicht entschlüsselbarer
 * oder manipulierter Wert muss immer als "nicht freigeschaltet" gelten, nie
 * als möglicher Klartext, den man unverändert übernimmt. Zusätzlich sind
 * User-ID und Ablaufzeit VOR der Verschlüsselung im Payload eingebettet und
 * werden beim Entschlüsseln geprüft — ein abgegriffener Cookie ist damit
 * weder für einen anderen User noch über die Ablaufzeit hinaus wiederverwendbar
 * (Audit-Finding H09).
 */
const TOKEN_PREFIX = "flu:v1:";

function getUnlockTokenKey(): Buffer {
  const secret = process.env.FIELD_ENCRYPTION_KEY || "development-only-change-this-key-before-production";

  // Eigener Info-String -> auch bei gleichem Quell-Secret ein anderer
  // abgeleiteter Schlüssel als `lib/encryption.ts` (Domain-Trennung).
  return scryptSync(secret, "ployo-folder-unlock-token", 32);
}

type UnlockTokenPayload = {
  userId: string;
  keys: string[];
  exp: number;
};

function encodeUnlockToken(payload: UnlockTokenPayload): string {
  const key = getUnlockTokenKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${TOKEN_PREFIX}${Buffer.concat([iv, authTag, ciphertext]).toString("base64")}`;
}

/** Liefert `null` bei jedem manipulierten, fremden, abgelaufenen oder Klartext-Wert — nie den Rohwert. */
function decodeUnlockToken(value: string, expectedUserId: string): UnlockTokenPayload | null {
  if (!value.startsWith(TOKEN_PREFIX)) {
    return null;
  }

  try {
    const key = getUnlockTokenKey();
    const raw = Buffer.from(value.slice(TOKEN_PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed: unknown = JSON.parse(decrypted);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as UnlockTokenPayload).userId !== "string" ||
      typeof (parsed as UnlockTokenPayload).exp !== "number" ||
      !Array.isArray((parsed as UnlockTokenPayload).keys)
    ) {
      return null;
    }

    const payload = parsed as UnlockTokenPayload;

    if (payload.userId !== expectedUserId || payload.exp < Date.now()) {
      return null;
    }

    return {
      userId: payload.userId,
      exp: payload.exp,
      keys: payload.keys.filter((entry): entry is string => typeof entry === "string"),
    };
  } catch {
    // Falscher Schlüssel, manipulierter Ciphertext oder kaputtes JSON: immer
    // "nicht freigeschaltet", nie den Rohwert oder einen Teilwert übernehmen.
    return null;
  }
}

async function getCurrentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });

  return session?.user?.id ?? null;
}

/** Liest die per Cookie freigeschalteten Ordner — an den aktuellen User und eine Ablaufzeit gebunden. */
async function getUnlockedFolderKeys(): Promise<string[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const raw = (await cookies()).get(UNLOCK_COOKIE)?.value;

  if (!raw) {
    return [];
  }

  const token = decodeUnlockToken(raw, userId);

  return token?.keys ?? [];
}

export async function isFolderUnlocked(tenantSlug: string, folderPath: string, scope = "tenant") {
  const keys = await getUnlockedFolderKeys();

  return keys.includes(folderUnlockKey(tenantSlug, scope, folderPath));
}

/** Merkt sich per Session-Cookie, dass die PIN für diesen Ordner bereits korrekt eingegeben wurde. */
export async function markFolderUnlocked(tenantSlug: string, folderPath: string, scope = "tenant") {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }

  const keys = await getUnlockedFolderKeys();
  const key = folderUnlockKey(tenantSlug, scope, folderPath);
  const nextKeys = keys.includes(key) ? keys : [...keys, key];
  const token = encodeUnlockToken({
    userId,
    keys: nextKeys,
    exp: Date.now() + UNLOCK_MAX_AGE_SECONDS * 1000,
  });

  (await cookies()).set(UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: isProductionRuntime,
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
