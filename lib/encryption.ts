import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * App-seitige Verschlüsselung für besonders sensible Mitarbeiterfelder
 * (IBAN, SV-Nummer, Steuer-ID, Krankenkasse). AES-256-GCM, Schlüssel aus
 * versionierten `FIELD_ENCRYPTION_KEY[_V{n}]`-Env-Variablen. Für eine
 * spätere KMS-Anbindung muss nur diese Datei geändert werden — alle
 * Aufrufer bleiben gleich.
 *
 * Key-Rotation (Runbook, hier bewusst nicht ausgeführt): `CURRENT_KEY_VERSION`
 * erhöhen, den neuen Schlüssel unter `FIELD_ENCRYPTION_KEY_V{n}` (n = neue
 * Version) setzen, den alten Schlüssel unter seinem bisherigen Namen
 * (`FIELD_ENCRYPTION_KEY` bzw. `FIELD_ENCRYPTION_KEY_V{alt}`) unverändert
 * stehen lassen — bestehende Daten tragen ihre Version im `enc:v{n}:`-Präfix
 * und werden weiterhin mit dem passenden alten Schlüssel entschlüsselt.
 * `encryptField` verschlüsselt ab dem Deploy automatisch unter der neuen
 * Version. Ein Umschlüsseln bereits gespeicherter Datensätze auf die neue
 * Version (decrypt unter alter Version, encrypt unter neuer, in Batches)
 * ist ein separater, gesondert freizugebender Migrationsschritt.
 */

const DEV_FALLBACK_KEY_SOURCE =
  "development-only-change-this-key-before-production";

const CURRENT_KEY_VERSION = 1;

const isProductionRuntime =
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build";

if (isProductionRuntime && !process.env.FIELD_ENCRYPTION_KEY) {
  throw new Error(
    "FIELD_ENCRYPTION_KEY ist nicht gesetzt. Bitte einen starken Schlüssel " +
      "(z. B. `openssl rand -base64 32`) konfigurieren, bevor sensible " +
      "Mitarbeiterdaten (IBAN, SV-Nummer, Steuer-ID, Krankenkasse) gespeichert werden.",
  );
}

/** v1 nutzt aus historischen Gründen den unversionierten Env-Namen. */
function envVarForVersion(version: number): string {
  return version === 1 ? "FIELD_ENCRYPTION_KEY" : `FIELD_ENCRYPTION_KEY_V${version}`;
}

// scrypt leitet aus einem beliebig langen Secret einen festen 32-Byte-AES-Schlüssel ab.
function deriveKey(secret: string): Buffer {
  return scryptSync(secret, "ployo-field-encryption", 32);
}

const keyCache = new Map<number, Buffer>();

function getKeyForVersion(version: number): Buffer {
  const cached = keyCache.get(version);
  if (cached) {
    return cached;
  }

  const envVar = envVarForVersion(version);
  const secret =
    process.env[envVar] ?? (version === 1 ? DEV_FALLBACK_KEY_SOURCE : undefined);
  if (!secret) {
    throw new Error(
      `Kein Schlüssel für Verschlüsselungs-Version ${version} konfiguriert ` +
        `(erwartet Env-Variable ${envVar}).`,
    );
  }

  const key = deriveKey(secret);
  keyCache.set(version, key);
  return key;
}

/** Verschlüsselt ein Klartextfeld unter der aktuellen Key-Version. Leere Werte bleiben leer (kein Overhead für unbefüllte Felder). */
export function encryptField(plaintext: string): string {
  if (!plaintext) {
    return "";
  }

  const key = getKeyForVersion(CURRENT_KEY_VERSION);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `enc:v${CURRENT_KEY_VERSION}:${Buffer.concat([iv, authTag, ciphertext]).toString("base64")}`;
}

const ENCRYPTED_PATTERN = /^enc:v(\d+):(.+)$/;

/**
 * Entschlüsselt einen mit `encryptField` verschlüsselten Wert, versionsbewusst
 * anhand des `enc:v{n}:`-Präfix. Werte ohne dieses Präfix gelten als
 * (Alt-)Klartext und werden unverändert zurückgegeben — so bricht das Lesen
 * bereits gespeicherter, unverschlüsselter Datensätze nicht, sobald die
 * Verschlüsselung aktiviert wird. Sie werden beim nächsten Speichern
 * automatisch verschlüsselt.
 *
 * Ein fehlender Schlüssel für die im Wert referenzierte Version ist ein
 * Konfigurationsfehler und wirft laut (siehe `getKeyForVersion`) — anders
 * als bei einer beschädigten/falsch entschlüsselten Nutzlast (siehe unten)
 * ist das kein erwarteter Zustand, den man still wegschlucken sollte.
 */
export function decryptField(value: string): string {
  if (!value) {
    return value;
  }

  const match = value.match(ENCRYPTED_PATTERN);
  if (!match) {
    return value;
  }

  const [, versionStr, payload] = match;
  const key = getKeyForVersion(Number(versionStr));

  try {
    const raw = Buffer.from(payload, "base64");
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Falscher Schlüssel für diese Version oder beschädigte Daten: lieber
    // leer als ein Crash der ganzen Personalakte.
    return "";
  }
}
