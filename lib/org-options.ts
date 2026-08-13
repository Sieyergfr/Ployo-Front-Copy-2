// Kanonische Options-Listen für Standort- und Team-Attribute. Werden sowohl
// clientseitig (Auswahl-UI in Anlage- und Bearbeitungsformularen) als auch
// serverseitig (Validierung in den jeweiligen Server Actions) verwendet,
// damit beide Seiten dieselben Werte zulassen. Keine server-only-Imports,
// damit die Datei auch in Client-Komponenten importierbar bleibt.

export const locationKinds = ["Filiale", "Zentrale", "Lager", "Buero", "Verwaltung"] as const;

export const locationColorPalette = [
  { value: "bg-ink", className: "bg-ink", label: "Schwarz" },
  { value: "bg-[#2A6FDB]", className: "bg-[#2A6FDB]", label: "Blau" },
  { value: "bg-success", className: "bg-success", label: "Grün" },
  { value: "bg-[#8B6ED4]", className: "bg-[#8B6ED4]", label: "Violett" },
  { value: "bg-[#C9622A]", className: "bg-[#C9622A]", label: "Orange" },
  { value: "bg-danger", className: "bg-danger", label: "Rot" },
  { value: "bg-[#168A8A]", className: "bg-[#168A8A]", label: "Türkis" },
  { value: "bg-[#5C6B7A]", className: "bg-[#5C6B7A]", label: "Schiefer" },
] as const;

export const teamColorPalette = [
  { value: "bg-[#C9622A]", className: "bg-[#C9622A]", label: "Orange" },
  { value: "bg-[#2A5BC9]", className: "bg-[#2A5BC9]", label: "Blau" },
  { value: "bg-[#1D8A65]", className: "bg-[#1D8A65]", label: "Grün" },
  { value: "bg-[#7A3C9C]", className: "bg-[#7A3C9C]", label: "Violett" },
  { value: "bg-[#B4332A]", className: "bg-[#B4332A]", label: "Rot" },
  { value: "bg-[#168A8A]", className: "bg-[#168A8A]", label: "Türkis" },
  { value: "bg-[#B7791F]", className: "bg-[#B7791F]", label: "Gold" },
  { value: "bg-[#4A5568]", className: "bg-[#4A5568]", label: "Schiefer" },
  { value: "bg-[#C23B7A]", className: "bg-[#C23B7A]", label: "Pink" },
  { value: "bg-[#6B8E23]", className: "bg-[#6B8E23]", label: "Limette" },
] as const;

export function isKnownLocationColor(value: string) {
  return locationColorPalette.some((color) => color.value === value);
}

export function isKnownTeamColor(value: string) {
  return teamColorPalette.some((color) => color.value === value);
}

export function isKnownLocationKind(value: string) {
  return (locationKinds as readonly string[]).includes(value);
}
