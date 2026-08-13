// Kanonische Slug-Erzeugung für Tenant-Namen. Wird sowohl serverseitig
// (lib/tenants.ts, tatsächliche Persistierung) als auch clientseitig
// (CompanyCreateWizard, Live-Vorschau) verwendet, damit beide Seiten für
// dieselbe Eingabe immer denselben Slug erzeugen. Keine server-only-Imports,
// damit die Datei auch in Client-Komponenten importierbar bleibt.
//
// Combining diacritical marks (U+0300–U+036F), die nach String.normalize("NFD")
// übrig bleiben, werden über Zeichencodes statt Regex-Escapes gebildet, damit
// im Quelltext keine rohen Kombinationszeichen landen.
const COMBINING_MARKS_START = String.fromCharCode(768); // U+0300
const COMBINING_MARKS_END = String.fromCharCode(879); // U+036F
const COMBINING_DIACRITICS = new RegExp(
  "[" + COMBINING_MARKS_START + "-" + COMBINING_MARKS_END + "]",
  "g",
);

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
