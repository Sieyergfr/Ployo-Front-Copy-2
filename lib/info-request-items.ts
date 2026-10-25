/**
 * Mehrteilige Info-Anfragen (M7): Elemente normalisieren und die
 * Übergangslösung für die alte App. Ohne Datenbankzugriff, damit sich die
 * Regeln direkt testen lassen.
 *
 * TODO(app-multi-item-requests): Solange die App mehrteilige Anfragen nicht
 * kennt, sieht sie eine solche Anfrage als *eine* Anfrage (Elemente als
 * Text-Aufzählung, siehe `legacyInfoRequestMessage`), und ihre Antwort
 * (Nachricht + eine Datei) landet beim ersten offenen Element
 * (`legacyResponseTargets`). Nach App-Update + Mindestversion zurückbauen —
 * siehe Dashboard-Umbau-Plan.md, Abschnitt 5, und To-Do.md.
 */

export type InfoRequestItemKind = "document" | "field";

export type InfoRequestItemInput = {
  kind: InfoRequestItemKind;
  label: string;
  required: boolean;
};

export type InfoRequestItemView = {
  id: string;
  kind: InfoRequestItemKind;
  label: string;
  required: boolean;
  status: "open" | "provided";
  value: string;
  fileId: string | null;
  fileName: string | null;
  respondedAt: string | null;
};

export const INFO_REQUEST_ITEM_ERRORS = {
  notFound: "Element nicht gefunden.",
  valueRequired: "Bitte eine Angabe machen.",
  fileRequired: "Bitte eine Datei hochladen.",
  closed: "Diese Info-Anfrage wurde storniert und kann nicht mehr beantwortet werden.",
} as const;

export const MAX_INFO_REQUEST_ITEMS = 20;

export function normalizeInfoRequestItems(raw: Array<Partial<InfoRequestItemInput>> | undefined): InfoRequestItemInput[] {
  return (raw ?? [])
    .map((item) => ({
      kind: (item.kind === "field" ? "field" : "document") as InfoRequestItemKind,
      label: (item.label ?? "").trim().slice(0, 160),
      required: item.required !== false,
    }))
    .filter((item) => item.label)
    .slice(0, MAX_INFO_REQUEST_ITEMS);
}

/** Titel aus den Elementen ableiten, wenn keiner angegeben ist: "Ausweis, Steuer-ID +2". */
export function deriveInfoRequestTitle(title: string, items: InfoRequestItemInput[]) {
  const trimmed = title.trim();

  if (trimmed || items.length === 0) return trimmed;

  const names = items.map((item) => item.label);

  return names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "");
}

/** Nachricht für die alte App: eigene Nachricht plus Aufzählung der Elemente. */
export function legacyInfoRequestMessage(message: string, items: Array<Pick<InfoRequestItemView, "kind" | "label" | "required" | "status">>) {
  if (items.length === 0) return message;

  const lines = items.map(
    (item) =>
      `• ${item.label} (${item.kind === "document" ? "Dokument" : "Angabe"}${item.required ? "" : ", optional"})${item.status === "provided" ? " ✓" : ""}`,
  );

  return [message.trim(), `Benötigt:\n${lines.join("\n")}`].filter(Boolean).join("\n\n");
}

/**
 * Antwort der alten App zuordnen: die Datei zum ersten offenen Dokument (sonst
 * zum ersten offenen Element überhaupt), die Nachricht zur ersten offenen
 * Angabe. Was keinen Platz findet, bleibt als Antwortnachricht der Anfrage.
 */
export function legacyResponseTargets(
  items: Array<Pick<InfoRequestItemView, "id" | "kind" | "status">>,
  input: { hasFile: boolean; hasMessage: boolean },
) {
  const open = items.filter((item) => item.status === "open");
  const fileItem = input.hasFile ? (open.find((item) => item.kind === "document") ?? open[0]) : undefined;
  const fieldItem = input.hasMessage ? open.find((item) => item.kind === "field" && item.id !== fileItem?.id) : undefined;

  return { fileItemId: fileItem?.id ?? null, fieldItemId: fieldItem?.id ?? null };
}

/** Alle Pflicht-Elemente beantwortet? (Ohne Pflicht-Elemente: mindestens eines.) */
export function infoRequestItemsComplete(items: Array<Pick<InfoRequestItemView, "required" | "status">>) {
  const required = items.filter((item) => item.required);

  return required.length > 0 ? required.every((item) => item.status === "provided") : items.some((item) => item.status === "provided");
}
