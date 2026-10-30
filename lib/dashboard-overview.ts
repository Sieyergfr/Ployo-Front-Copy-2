/**
 * Reine Berechnungen für die Übersicht (Dashboard-Startseite): Besetzungs-
 * kurve des Tages und Abwesenheits-Radar. Ohne Datenbankzugriff, damit sie
 * sich ohne Fixtures testen lassen — die Seite lädt die Daten über die
 * bestehenden Services (mit deren Rechte- und Scope-Prüfungen) und reicht sie
 * hier nur durch.
 */
import { findRestPeriodViolation } from "@/lib/arbzg-rules";
import type { OpeningHoursDay } from "@/lib/opening-hours";

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

/** Zeitfenster in Minuten ab 0 Uhr; ein Ende ≤ Beginn läuft über Mitternacht. */
function toInterval(start: string, end: string) {
  const startMinutes = toMinutes(start);
  let endMinutes = toMinutes(end);

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  return { start: startMinutes, end: endMinutes };
}

function covers(interval: { start: number; end: number }, minute: number) {
  return interval.start <= minute && minute < interval.end;
}

export type StaffingShift = {
  startTime?: string;
  endTime?: string;
  employeeId?: string;
  locationId?: string;
};

export type StaffingLocation = {
  id: string;
  name: string;
  openingHours: OpeningHoursDay[];
  minStaffing: number;
};

export type StaffingHour = {
  hour: number;
  /** Bedarf: Summe der Mindestbesetzung aller zu dieser Stunde geöffneten Standorte. */
  need: number;
  /** Besetzt: eingeplante Personen, deren Schicht die Stundenmitte abdeckt. */
  have: number;
  isGap: boolean;
};

export type StaffingGap = {
  locationName: string;
  fromHour: number;
  toHour: number;
  missing: number;
};

/**
 * Besetzung je Stunde für einen Tag. Den Bedarf je Stunde gibt es nicht als
 * eigenes Datenfeld; er wird aus Öffnungszeiten × Mindestbesetzung je
 * Standort abgeleitet (Entscheidung im Umbau-Plan, Frage 4). Gezählt wird zur
 * Stundenmitte, damit eine Schicht bis 14:00 nicht noch die Stunde 14–15 füllt.
 */
export function buildStaffingCurve(input: {
  shifts: StaffingShift[];
  locations: StaffingLocation[];
  weekday: OpeningHoursDay["weekday"];
}): { hours: StaffingHour[]; gaps: StaffingGap[] } {
  const assigned = input.shifts
    .filter((shift) => shift.employeeId && shift.startTime && shift.endTime)
    .map((shift) => ({
      locationId: shift.locationId ?? "",
      interval: toInterval(shift.startTime!, shift.endTime!),
    }));
  const openLocations = input.locations.map((location) => {
    const day = location.openingHours.find((item) => item.weekday === input.weekday);
    const intervals =
      !day || day.mode === "closed"
        ? []
        : day.mode === "24h"
          ? [{ start: 0, end: 24 * 60 }]
          : day.ranges.map((range) => toInterval(range.start, range.end));

    return { ...location, intervals };
  });

  const hours: StaffingHour[] = [];
  const gapsByLocation = new Map<string, Array<{ hour: number; missing: number }>>();

  for (let hour = 0; hour < 24; hour += 1) {
    const midpoint = hour * 60 + 30;
    let need = 0;

    for (const location of openLocations) {
      if (!location.intervals.some((interval) => covers(interval, midpoint))) {
        continue;
      }

      need += location.minStaffing;

      const haveHere = assigned.filter(
        (shift) => shift.locationId === location.id && covers(shift.interval, midpoint),
      ).length;

      if (haveHere < location.minStaffing) {
        const list = gapsByLocation.get(location.id) ?? [];

        list.push({ hour, missing: location.minStaffing - haveHere });
        gapsByLocation.set(location.id, list);
      }
    }

    const have = assigned.filter((shift) => covers(shift.interval, midpoint)).length;

    hours.push({ hour, need, have, isGap: have < need });
  }

  const gaps: StaffingGap[] = [];

  for (const location of openLocations) {
    const list = gapsByLocation.get(location.id) ?? [];

    for (const item of list) {
      const previous = gaps[gaps.length - 1];

      if (
        previous &&
        previous.locationName === location.name &&
        previous.toHour === item.hour &&
        previous.missing === item.missing
      ) {
        previous.toHour = item.hour + 1;
      } else {
        gaps.push({
          locationName: location.name,
          fromHour: item.hour,
          toHour: item.hour + 1,
          missing: item.missing,
        });
      }
    }
  }

  return { hours, gaps };
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export type RadarAbsence = { employeeId: string; from: string; to: string };

export type RadarDay = { date: string; count: number; isWeekend: boolean };

export type RadarPeak = {
  team: string;
  dates: string[];
  absent: number;
  teamSize: number;
};

/**
 * Abwesenheiten (genehmigter Urlaub, Krankheit) je Tag über 14 Tage ab
 * `startDate`, plus Engpässe: Tage, an denen in einem Team mindestens zwei
 * Personen und mindestens 40 % fehlen.
 */
export function buildAbsenceRadar(input: {
  startDate: string;
  absences: RadarAbsence[];
  employees: Array<{ id: string; team: string }>;
  days?: number;
}): { days: RadarDay[]; peak: RadarPeak | null } {
  const dayCount = input.days ?? 14;
  const teamById = new Map(input.employees.map((employee) => [employee.id, employee.team]));
  const teamSizes = new Map<string, number>();

  for (const employee of input.employees) {
    if (employee.team) {
      teamSizes.set(employee.team, (teamSizes.get(employee.team) ?? 0) + 1);
    }
  }

  const days: RadarDay[] = [];
  const peaks = new Map<string, RadarPeak>();

  for (let index = 0; index < dayCount; index += 1) {
    const date = addDays(input.startDate, index);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const absentIds = new Set(
      input.absences
        .filter((absence) => absence.from <= date && absence.to >= date)
        .map((absence) => absence.employeeId)
        .filter((id) => teamById.has(id)),
    );

    days.push({ date, count: absentIds.size, isWeekend: weekday === 0 || weekday === 6 });

    const absentByTeam = new Map<string, number>();

    for (const id of absentIds) {
      const team = teamById.get(id);

      if (team) {
        absentByTeam.set(team, (absentByTeam.get(team) ?? 0) + 1);
      }
    }

    for (const [team, absent] of absentByTeam) {
      const teamSize = teamSizes.get(team) ?? 0;

      if (absent >= 2 && teamSize > 0 && absent / teamSize >= 0.4) {
        const peak = peaks.get(team);

        if (peak) {
          peak.dates.push(date);
          peak.absent = Math.max(peak.absent, absent);
        } else {
          peaks.set(team, { team, dates: [date], absent, teamSize });
        }
      }
    }
  }

  // Der stärkste Engpass zuerst; bei Gleichstand der früheste.
  const peak =
    [...peaks.values()].sort(
      (a, b) => b.absent / b.teamSize - a.absent / a.teamSize || a.dates[0].localeCompare(b.dates[0]),
    )[0] ?? null;

  return { days, peak };
}

export type RestShift = {
  employeeId: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type RestViolation = {
  employeeId: string;
  name: string;
  fromDate: string;
  toDate: string;
  restHours: number;
};

/** Ruhezeit-Unterschreitungen (§5 ArbZG) zwischen aufeinanderfolgenden Schichten je Person. */
export function findRestViolations(shifts: RestShift[], minRestHours: number): RestViolation[] {
  const byEmployee = new Map<string, RestShift[]>();

  for (const shift of shifts) {
    const list = byEmployee.get(shift.employeeId) ?? [];

    list.push(shift);
    byEmployee.set(shift.employeeId, list);
  }

  const violations: RestViolation[] = [];

  for (const list of byEmployee.values()) {
    const sorted = [...list].sort(
      (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
    );

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const violation = findRestPeriodViolation([previous], current, minRestHours);

      if (violation) {
        violations.push({
          employeeId: current.employeeId,
          name: current.name,
          fromDate: previous.date,
          toDate: current.date,
          restHours: violation.restHours,
        });
      }
    }
  }

  return violations.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
}

/** Sieben Stunden um die aktuelle Stunde, begrenzt auf den ausgewählten Tag. */
export function staffingWindow(hours: StaffingHour[], currentHour: number) {
  const start = Math.max(0, Math.min(17, currentHour - 3));
  return hours.filter((hour) => hour.hour >= start && hour.hour < start + 7);
}
