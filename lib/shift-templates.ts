/**
 * Wochenvorlagen (wiederverwendbare Schichtmuster). Bewusst frei von DB- und
 * Auth-Abhängigkeiten, damit die Validierung isoliert testbar bleibt —
 * gleiches Muster wie lib/shift-presets.ts.
 */

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export type TemplateWeekday = (typeof weekdays)[number];

export type ShiftTemplateEntry = {
  weekday: TemplateWeekday;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  team: string;
  locationId: string;
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_ENTRIES = 60;

export function parseShiftTemplateEntries(value: unknown): ShiftTemplateEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => ({
      weekday: weekdays.includes(item.weekday as TemplateWeekday)
        ? (item.weekday as TemplateWeekday)
        : "Mo",
      startTime: typeof item.startTime === "string" ? item.startTime : "",
      endTime: typeof item.endTime === "string" ? item.endTime : "",
      breakMinutes:
        typeof item.breakMinutes === "number" && Number.isFinite(item.breakMinutes)
          ? Math.max(0, Math.round(item.breakMinutes))
          : 0,
      team: typeof item.team === "string" ? item.team.slice(0, 64) : "",
      locationId: typeof item.locationId === "string" ? item.locationId : "",
    }))
    .filter(
      (entry) =>
        timePattern.test(entry.startTime) && timePattern.test(entry.endTime),
    )
    .slice(0, MAX_ENTRIES);
}
