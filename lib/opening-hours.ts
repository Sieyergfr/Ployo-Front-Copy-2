/**
 * Standort-Öffnungszeiten (Standardeinstellungen + benutzerdefiniert je
 * Standort). Bewusst frei von DB-/Auth-Abhängigkeiten, damit die Validierung
 * isoliert testbar bleibt — gleiches Muster wie lib/shift-templates.ts.
 */

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export type OpeningHoursWeekday = (typeof weekdays)[number];
export const OPENING_HOURS_WEEKDAYS: readonly OpeningHoursWeekday[] = weekdays;

export const OPENING_HOURS_WEEKDAY_LABELS: Record<OpeningHoursWeekday, string> = {
  Mo: "Montag",
  Di: "Dienstag",
  Mi: "Mittwoch",
  Do: "Donnerstag",
  Fr: "Freitag",
  Sa: "Samstag",
  So: "Sonntag",
};

export type OpeningHoursMode = "closed" | "24h" | "custom";

export type OpeningHoursRange = {
  start: string;
  end: string;
  breakMinutes: number;
};

/** Höchstzahl an Zeitfenstern pro Tag — genug für z. B. Vormittag/Nachmittag mit Mittagsschließung dazwischen. */
export const MAX_OPENING_HOURS_RANGES_PER_DAY = 4;

export type OpeningHoursDay = {
  weekday: OpeningHoursWeekday;
  mode: OpeningHoursMode;
  /**
   * Nur bei `mode: "custom"` befüllt — ein oder mehrere Zeitfenster pro Tag
   * (z. B. 09:00–13:00 und 14:00–18:00 für eine Mittagsschließung).
   */
  ranges: OpeningHoursRange[];
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseMode(value: unknown): OpeningHoursMode {
  return value === "24h" || value === "custom" ? value : "closed";
}

function parseRanges(value: unknown): OpeningHoursRange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => ({
      start: typeof item.start === "string" ? item.start : "",
      end: typeof item.end === "string" ? item.end : "",
      breakMinutes:
        typeof item.breakMinutes === "number" && Number.isFinite(item.breakMinutes)
          ? Math.max(0, Math.round(item.breakMinutes))
          : 0,
    }))
    .filter((range) => timePattern.test(range.start) && timePattern.test(range.end))
    .slice(0, MAX_OPENING_HOURS_RANGES_PER_DAY);
}

/** Fehlende/kaputte Einträge werden übersprungen — ein Tag ohne Eintrag gilt als geschlossen. */
export function parseOpeningHoursDays(value: unknown): OpeningHoursDay[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => {
      const mode = parseMode(item.mode);

      return {
        weekday: weekdays.includes(item.weekday as OpeningHoursWeekday)
          ? (item.weekday as OpeningHoursWeekday)
          : "Mo",
        mode,
        ranges: mode === "custom" ? parseRanges(item.ranges) : [],
      };
    })
    .slice(0, weekdays.length);
}

/** Standard-Geschäftszeiten, falls weder Standort noch Mandant etwas hinterlegt haben. */
export const DEFAULT_OPENING_HOURS: OpeningHoursDay[] = [
  { weekday: "Mo", mode: "custom", ranges: [{ start: "09:00", end: "18:00", breakMinutes: 30 }] },
  { weekday: "Di", mode: "custom", ranges: [{ start: "09:00", end: "18:00", breakMinutes: 30 }] },
  { weekday: "Mi", mode: "custom", ranges: [{ start: "09:00", end: "18:00", breakMinutes: 30 }] },
  { weekday: "Do", mode: "custom", ranges: [{ start: "09:00", end: "18:00", breakMinutes: 30 }] },
  { weekday: "Fr", mode: "custom", ranges: [{ start: "09:00", end: "18:00", breakMinutes: 30 }] },
  { weekday: "Sa", mode: "closed", ranges: [] },
  { weekday: "So", mode: "closed", ranges: [] },
];

/**
 * Effektive Öffnungszeiten eines Standorts: eigene Angabe, falls hinterlegt,
 * sonst der Mandanten-Standard, sonst der eingebaute Standard — nie "leer"
 * (fehlende Konfiguration soll nicht wie "an jedem Tag geschlossen" wirken).
 */
export function resolveEffectiveOpeningHours(
  locationOverride: OpeningHoursDay[],
  tenantDefault: OpeningHoursDay[],
): OpeningHoursDay[] {
  if (locationOverride.length > 0) {
    return locationOverride;
  }

  if (tenantDefault.length > 0) {
    return tenantDefault;
  }

  return DEFAULT_OPENING_HOURS;
}

export function openingHoursForWeekday(
  days: OpeningHoursDay[],
  weekday: OpeningHoursWeekday,
): OpeningHoursDay {
  return days.find((day) => day.weekday === weekday) ?? { weekday, mode: "closed", ranges: [] };
}

export function isOpenOnWeekday(days: OpeningHoursDay[], weekday: OpeningHoursWeekday): boolean {
  return openingHoursForWeekday(days, weekday).mode !== "closed";
}

const isoWeekdayOrder: OpeningHoursWeekday[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** `Date.getUTCDay()` (0=So) auf unser Mo-So-Schema gemappt. */
export function weekdayFromDate(date: Date): OpeningHoursWeekday {
  const jsDay = date.getUTCDay();

  return isoWeekdayOrder[(jsDay + 6) % 7];
}

export function formatOpeningHoursRange(day: OpeningHoursDay): string {
  if (day.mode === "closed") {
    return "Geschlossen";
  }

  if (day.mode === "24h") {
    return "Rund um die Uhr";
  }

  if (day.ranges.length === 0) {
    return "Geschlossen";
  }

  return day.ranges.map((range) => `${range.start}–${range.end}`).join(", ");
}
