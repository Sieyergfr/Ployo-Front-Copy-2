/**
 * Kennzahlen für den Tab "Übersicht" der Personalakte, berechnet aus den
 * Tagen der Zeiterfassung (gestempelte Einträge + veröffentlichte Schichten).
 * Ohne Datenbankzugriff, damit sie sich direkt testen lassen.
 */
import { computeOvertimeAccount } from "@/lib/my-times";
import { requiredBreakMinutes } from "@/lib/time-tracking";

export type OverviewDay = {
  date: string;
  workedMinutes: number;
  plannedMinutes: number;
  breakMinutes: number;
  entries: Array<{ clockInAt: string; shift: { startAt: string | null } | null }>;
  shifts: Array<{ startTime: string; endTime: string; location: string }>;
};

function mondayOf(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));

  return date.toISOString().slice(0, 10);
}

export function buildEmployeeWorkStats(input: {
  days: OverviewDay[];
  today: string;
  weeklyTargetMinutes: number | null;
  /** Toleranz für "pünktlich" (Minuten nach Schichtbeginn). */
  punctualityToleranceMinutes?: number;
}) {
  const tolerance = (input.punctualityToleranceMinutes ?? 5) * 60_000;
  const past = input.days.filter((day) => day.date <= input.today);
  const weekMap = new Map<string, { worked: number; planned: number }>();

  for (const day of past) {
    const key = mondayOf(day.date);
    const week = weekMap.get(key) ?? { worked: 0, planned: 0 };

    week.worked += day.workedMinutes;
    week.planned += day.plannedMinutes;
    weekMap.set(key, week);
  }

  const weeks = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monday, week]) => ({ monday, ...week, isCurrent: monday === mondayOf(input.today) }));
  const overtime = computeOvertimeAccount({
    days: past,
    today: mondayOf(input.today),
    weeklyTargetMinutes: input.weeklyTargetMinutes,
  });
  const month = input.today.slice(0, 7);
  const monthDays = past.filter((day) => day.date.startsWith(month));

  let withShift = 0;
  let punctual = 0;

  for (const entry of past.flatMap((day) => day.entries)) {
    if (!entry.shift?.startAt) continue;

    withShift += 1;

    if (Date.parse(entry.clockInAt) <= Date.parse(entry.shift.startAt) + tolerance) {
      punctual += 1;
    }
  }

  const workedDays = past.filter((day) => day.workedMinutes > 0);
  const shiftTypes = { early: 0, late: 0, night: 0 };
  const locationCounts = new Map<string, number>();

  for (const shift of past.flatMap((day) => day.shifts)) {
    const startHour = Number(shift.startTime.slice(0, 2));
    const overnight = shift.endTime <= shift.startTime;

    if (overnight || startHour >= 20 || startHour < 4) shiftTypes.night += 1;
    else if (startHour < 11) shiftTypes.early += 1;
    else shiftTypes.late += 1;

    if (shift.location) {
      locationCounts.set(shift.location, (locationCounts.get(shift.location) ?? 0) + 1);
    }
  }

  const shiftTotal = shiftTypes.early + shiftTypes.late + shiftTypes.night;
  const locationTotal = [...locationCounts.values()].reduce((sum, value) => sum + value, 0);

  return {
    weeks,
    overtimeMinutes: overtime.balanceMinutes,
    monthWorkedMinutes: monthDays.reduce((sum, day) => sum + day.workedMinutes, 0),
    monthPlannedMinutes: monthDays.reduce((sum, day) => sum + day.plannedMinutes, 0),
    punctualityPercent: withShift > 0 ? Math.round((punctual / withShift) * 100) : null,
    averageBreakMinutes: workedDays.length
      ? Math.round(workedDays.reduce((sum, day) => sum + day.breakMinutes, 0) / workedDays.length)
      : null,
    breaksOk: workedDays.every((day) => day.breakMinutes >= requiredBreakMinutes(day.workedMinutes + day.breakMinutes)),
    shiftTypes:
      shiftTotal > 0
        ? {
            early: Math.round((shiftTypes.early / shiftTotal) * 100),
            late: Math.round((shiftTypes.late / shiftTotal) * 100),
            night: Math.round((shiftTypes.night / shiftTotal) * 100),
          }
        : null,
    locations: [...locationCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, percent: Math.round((count / locationTotal) * 100) })),
  };
}
