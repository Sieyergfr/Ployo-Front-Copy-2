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

const MAX_PRESETS = 20;

export function parseShiftPresets(value: string): ShiftPreset[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id ? item.id : `preset-${index}`,
      label: typeof item.label === "string" ? item.label.slice(0, 64) : "",
      start: typeof item.start === "string" ? item.start : "",
      end: typeof item.end === "string" ? item.end : "",
      pause: typeof item.pause === "string" ? item.pause : "0m",
    }))
    .filter(
      (preset) =>
        preset.label.trim() !== "" &&
        timePattern.test(preset.start) &&
        timePattern.test(preset.end),
    )
    .slice(0, MAX_PRESETS);
}
