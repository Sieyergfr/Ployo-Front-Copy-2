/**
 * Standardschichten eines Mandanten. Bewusst frei von DB- und
 * Auth-Abhängigkeiten, damit die Validierung isoliert testbar bleibt.
 */

export type ShiftPreset = {
  id: string;
  label: string;
  start: string;
  end: string;
  pause: string;
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

// Muss mit den <option>-Werten im Presets-Formular (ActionDrawers.tsx) übereinstimmen.
const allowedPauses = new Set(["0m", "15m", "30m", "45m", "60m"]);

const MAX_PRESETS = 20;

export function parseShiftPresets(value: unknown): ShiftPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id ? item.id : `preset-${index}`,
      label: typeof item.label === "string" ? item.label.slice(0, 64) : "",
      start: typeof item.start === "string" ? item.start : "",
      end: typeof item.end === "string" ? item.end : "",
      pause:
        typeof item.pause === "string" && allowedPauses.has(item.pause)
          ? item.pause
          : "0m",
    }))
    .filter(
      (preset) =>
        preset.label.trim() !== "" &&
        timePattern.test(preset.start) &&
        timePattern.test(preset.end),
    )
    .slice(0, MAX_PRESETS);
}
