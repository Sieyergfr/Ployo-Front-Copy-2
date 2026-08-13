import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * App-seitige Verschlüsselung für besonders sensible Mitarbeiterfelder
 * (IBAN, SV-Nummer, Steuer-ID, Krankenkasse). AES-256-GCM, Schlüssel aus
 * `FIELD_ENCRYPTION_KEY` (env-basiertes Key-Management). Für eine spätere
 * KMS-Anbindung muss nur diese Datei geändert werden — alle Aufrufer
 * bleiben gleich.
 */

const DEV_FALLBACK_KEY_SOURCE =
  "development-only-change-this-key-before-production";
const ENCRYPTED_PREFIX = "enc:v1:";

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

// scrypt leitet aus einem beliebig langen Secret einen festen 32-Byte-AES-Schlüssel ab.
const encryptionKey = scryptSync(
  process.env.FIELD_ENCRYPTION_KEY ?? DEV_FALLBACK_KEY_SOURCE,
  "ployo-field-encryption",
  32,
);

export function isFieldEncryptionConfigured() {
  return Boolean(process.env.FIELD_ENCRYPTION_KEY);
}

/** Verschlüsselt ein Klartextfeld. Leere Werte bleiben leer (kein Overhead für unbefüllte Felder). */
export function encryptField(plaintext: string): string {
  if (!plaintext) {
    return "";
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${Buffer.concat([iv, authTag, ciphertext]).toString("base64")}`;
}

/**
 * Entschlüsselt einen mit `encryptField` verschlüsselten Wert. Werte ohne
 * das Präfix gelten als (Alt-)Klartext und werden unverändert zurückgegeben
 * — so bricht das Lesen bereits gespeicherter, unverschlüsselter Datensätze
 * nicht, sobald die Verschlüsselung aktiviert wird. Sie werden beim
 * nächsten Speichern automatisch verschlüsselt.
 */
export function decryptField(value: string): string {
  if (!value || !value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  try {
    const raw = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Falsch konfigurierter/rotierter Schlüssel: lieber leer als ein Crash
    // der ganzen Personalakte.
    return "";
  }
}
