/**
 * Hilfen für "Mein Bereich" / "Meine Zeiten": Soll-Stunden aus dem
 * Freitext-Feld `weeklyHours` und das Überstunden-Konto. Ohne
 * Datenbankzugriff, damit sie sich direkt testen lassen.
 */

/**
 * Wochenstunden aus Angaben wie "40", "37,5 Std.", "38.5h" oder
 * "40 Stunden pro Woche". `null`, wenn keine plausible Zahl darin steht.
 */
export function parseWeeklyHours(value: string | null | undefined): number | null {
  const match = /(?<![\d.,])(\d+(?:[.,]\d{1,2})?)/.exec(value ?? "");

  if (!match) {
    return null;
  }

  const hours = Number.parseFloat(match[1].replace(",", "."));

  return hours > 0 && hours <= 80 ? hours : null;
}

export type OvertimeDay = { date: string; workedMinutes: number; plannedMinutes: number };

/**
 * Überstunden-Konto über abgeschlossene Wochen (Mo–So, jeweils vor
 * `today`): je Woche gearbeitet minus Soll. Soll sind die geplanten
 * Schichtstunden der Woche — darin sind Urlaub und Krankheit bereits
 * berücksichtigt. Wurde für eine Woche nichts geplant, aber gearbeitet, gelten
 * die vertraglichen Wochenstunden; Wochen ohne Plan und ohne Arbeit zählen
 * nicht (z. B. vor dem Eintritt oder im Urlaub ohne Schichtplanung).
 */
export function computeOvertimeAccount(input: {
  days: OvertimeDay[];
  today: string;
  weeklyTargetMinutes: number | null;
}) {
  const weeks = new Map<string, { worked: number; planned: number }>();

  for (const day of input.days) {
    const date = new Date(`${day.date}T00:00:00Z`);
    const monday = new Date(date);

    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));

    const sunday = new Date(monday);

    sunday.setUTCDate(monday.getUTCDate() + 6);

    if (sunday.toISOString().slice(0, 10) >= input.today) {
      continue;
    }

    const key = monday.toISOString().slice(0, 10);
    const week = weeks.get(key) ?? { worked: 0, planned: 0 };

    week.worked += day.workedMinutes;
    week.planned += day.plannedMinutes;
    weeks.set(key, week);
  }

  let balanceMinutes = 0;

  for (const week of weeks.values()) {
    const target =
      week.planned > 0 ? week.planned : week.worked > 0 ? (input.weeklyTargetMinutes ?? week.worked) : 0;

    balanceMinutes += week.worked - target;
  }

  return { balanceMinutes, weekCount: weeks.size };
}
