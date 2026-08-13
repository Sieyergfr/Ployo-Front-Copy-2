/**
 * Reine Pausenregel-Logik, bewusst ohne DB-/Auth-Abhängigkeiten — wird
 * sowohl serverseitig (lib/shift-service.ts) als auch clientseitig
 * (ShiftPlanningClient, LocationShiftPlanner) für die Live-Vorschau
 * beim Ausfüllen des Schicht-Formulars verwendet.
 */

function shiftDurationMinutes(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  if (
    ![startHour, startMinute, endHour, endMinute].every((value) =>
      Number.isFinite(value),
    )
  ) {
    return 0;
  }

  const duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);

  // Schicht über Mitternacht (z. B. Nachtschicht 22:00-06:00).
  return duration >= 0 ? duration : duration + 24 * 60;
}

/**
 * Leitet die vorgeschriebene Pause aus der Mandanten-Pausenregel
 * (Format "<Minuten>-<Stunden>", z. B. "30-6" = 30 Minuten ab 6h Dauer) und
 * der Schichtlänge ab. "none" deaktiviert die automatische Pause.
 */
export function calculateBreakMinutes(
  startTime: string,
  endTime: string,
  breakRule: string,
) {
  if (!breakRule || breakRule === "none") {
    return 0;
  }

  const [minutesPart, thresholdHoursPart] = breakRule.split("-");
  const minutes = Number.parseInt(minutesPart, 10);
  const thresholdHours = Number.parseInt(thresholdHoursPart, 10);

  if (!Number.isFinite(minutes) || !Number.isFinite(thresholdHours)) {
    return 0;
  }

  const durationMinutes = shiftDurationMinutes(startTime, endTime);

  return durationMinutes >= thresholdHours * 60 ? minutes : 0;
}
