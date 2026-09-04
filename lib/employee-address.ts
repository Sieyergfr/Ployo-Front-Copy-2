import "server-only";
import { decryptField, encryptField } from "@/lib/encryption";
import { normalizeAddressInput, type AddressShape } from "@/lib/address";

/**
 * Verschlüsselungs-Gegenstücke zu `lib/address.ts`, ausgelagert in eine
 * eigene, server-only Datei: `lib/address.ts` wird auch von
 * `components/AddressFields.tsx` (Client-Component) importiert, und
 * `lib/encryption.ts` zieht `node:crypto` + `import "server-only"` nach sich
 * — das hätte den Client-Bundle-Build gebrochen, wäre hier mit hineingelandet
 * (siehe Build-Fehler beim ersten Versuch, direkt in lib/address.ts).
 *
 * Nur für `EmployeeAddress` (Mitarbeiter-Privat-/Arbeitsadresse) gedacht —
 * *nicht* für die geteilte `Address`-Tabelle (Standort-/Firmenadressen, die
 * bleiben Klartext).
 */
export function encryptAddress(address: ReturnType<typeof normalizeAddressInput>) {
  return {
    street: encryptField(address.street),
    houseNumber: encryptField(address.houseNumber),
    postalCode: encryptField(address.postalCode),
    city: encryptField(address.city),
    careOf: encryptField(address.careOf),
    country: encryptField(address.country),
  };
}

/** Gegenstück zu `encryptAddress` — direkt nach dem Lesen aus `EmployeeAddress`. */
export function decryptAddress(address: AddressShape): AddressShape;
export function decryptAddress(address?: AddressShape | null): AddressShape | null;
export function decryptAddress(address?: AddressShape | null): AddressShape | null {
  if (!address) {
    return null;
  }

  return {
    street: decryptField(address.street),
    houseNumber: decryptField(address.houseNumber),
    postalCode: decryptField(address.postalCode),
    city: decryptField(address.city),
    careOf: decryptField(address.careOf),
    country: decryptField(address.country),
  };
}
