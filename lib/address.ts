export type AddressInput = {
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  careOf?: string;
  country?: string;
};

/**
 * Strukturell statt an ein konkretes Prisma-Modell gebunden: passt sowohl auf
 * `Address` (Standort-/Firmenadressen) als auch auf `EmployeeAddress`
 * (Mitarbeiter-Privat-/Arbeitsadresse, verschlüsselt) — beide haben dieselben
 * sechs Felder.
 *
 * Diese Datei bleibt bewusst client-sicher (`components/AddressFields.tsx`
 * importiert sie) — die Verschlüsselungs-Gegenstücke `encryptAddress`/
 * `decryptAddress` liegen deshalb separat in `lib/employee-address.ts`
 * (server-only, wegen `lib/encryption.ts`'s `node:crypto`-Abhängigkeit).
 */
export type AddressShape = {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  careOf: string;
  country: string;
};

export function normalizeAddressInput(input: AddressInput = {}) {
  return {
    street: input.street?.trim().slice(0, 255) ?? "",
    houseNumber: input.houseNumber?.trim().slice(0, 64) ?? "",
    postalCode: input.postalCode?.trim().slice(0, 32) ?? "",
    city: input.city?.trim().slice(0, 128) ?? "",
    careOf: input.careOf?.trim().slice(0, 255) ?? "",
    country: input.country?.trim().slice(0, 64).toUpperCase() || "DE",
  };
}

const GERMAN_POSTAL_CODE_PATTERN = /^\d{5}$/;

/**
 * Reine Formatprüfung der PLZ (QA-Bug BUG-008) — nur für Deutschland
 * durchgesetzt (5 Ziffern), da andere Länder abweichende Formate haben
 * (z. B. Buchstaben in Großbritannien/Niederlande) und dieses Feld bewusst
 * für alle Länder freigegeben ist. Greift nur, wenn eine PLZ angegeben
 * wurde — ein komplett leeres (optionales) Adressfeld bleibt erlaubt.
 */
export function assertValidAddressFormat(input: AddressShape) {
  if (input.postalCode && input.country === "DE" && !GERMAN_POSTAL_CODE_PATTERN.test(input.postalCode)) {
    throw new Error("Bitte eine gültige deutsche Postleitzahl (5 Ziffern) angeben.");
  }
}

/** Wirft, wenn eines der im Formular als Pflichtfeld markierten Adressfelder fehlt. */
export function assertRequiredAddress(input: AddressInput = {}) {
  const normalized = normalizeAddressInput(input);

  if (
    !normalized.street ||
    !normalized.houseNumber ||
    !normalized.postalCode ||
    !normalized.city
  ) {
    throw new Error("Bitte die vollständige Adresse angeben.");
  }

  assertValidAddressFormat(normalized);

  return normalized;
}

export function hasAddressInput(input: AddressInput = {}) {
  const normalized = normalizeAddressInput(input);

  return Boolean(
    normalized.street ||
      normalized.houseNumber ||
      normalized.postalCode ||
      normalized.city ||
      normalized.careOf,
  );
}

export function formatAddress(
  address?: AddressShape | null,
) {
  // Ohne echte Adressdaten (nur der `country`-Default "DE") nicht "DE" als
  // vermeintliche Adresse anzeigen (QA-Bug BUG-028, Teil 1 — betraf u. a.
  // die "Standort-Adresse" in der Personalakte, wenn nichts eingetragen war).
  if (!address || !hasAddressInput(address)) {
    return "";
  }

  const streetLine = [address.street, address.houseNumber].filter(Boolean).join(" ");
  const cityLine = [address.postalCode, address.city].filter(Boolean).join(" ");

  return [address.careOf, streetLine, cityLine, address.country]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export function addressDefaults(
  address?: AddressInput | AddressShape | null,
) {
  return {
    street: address?.street ?? "",
    houseNumber: address?.houseNumber ?? "",
    postalCode: address?.postalCode ?? "",
    city: address?.city ?? "",
    careOf: address?.careOf ?? "",
    country: address?.country ?? "DE",
  };
}
