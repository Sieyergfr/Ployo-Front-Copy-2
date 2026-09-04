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
  if (!address) {
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
