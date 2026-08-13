// Kanonische Options-Listen für die Unternehmens-Anlage (CompanyCreateWizard).
// Serverseitig (lib/tenants.ts) zur Validierung verwendet, clientseitig für
// die Auswahl-UI — keine server-only-Imports, damit die Datei auch in
// Client-Komponenten importierbar bleibt.

export const tenantSizes = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

export const tenantIndustries = [
  "Technologie & Software",
  "Einzelhandel & E-Commerce",
  "Produktion",
  "Gesundheit",
  "Bau",
  "Logistik & Transport",
  "Dienstleistungen",
  "Hotellerie & Gastronomie",
  "Finanzen & Versicherung",
  "Bildung",
  "Sonstiges",
] as const;

export function isKnownTenantSize(value: string) {
  return (tenantSizes as readonly string[]).includes(value);
}

export function isKnownTenantIndustry(value: string) {
  return (tenantIndustries as readonly string[]).includes(value);
}
