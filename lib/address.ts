import type { Address } from "@prisma/client";

export type AddressInput = {
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  careOf?: string;
  country?: string;
};

type AddressShape = Pick<
  Address,
  "street" | "houseNumber" | "postalCode" | "city" | "careOf" | "country"
>;

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
