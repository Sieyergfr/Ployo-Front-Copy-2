import { shiftNetMinutes } from "@/lib/shift-offers";

/**
 * Überstunden-Warnung im Schichtplan (M4): geplante Netto-Minuten einer
 * Woche gegen die Vertragsstunden (`TenantEmployee.weeklyHours`, Freitext
 * wie "38 Std/Woche"). Ohne lesbare Vertragsstunden keine Warnung.
 */

export function parseWeeklyHours(value: string) {
  const match = /(\d+(?:[.,]\d+)?)/.exec(value);

  return match ? Number(match[1].replace(",", ".")) : null;
}

export type OvertimeWarning = { employeeId: string; name: string; plannedMinutes: number; targetMinutes: number };

export function computeOvertimeWarnings(input: {
  shifts: Array<{ employeeId?: string; startTime?: string; endTime?: string; breakMinutes?: number }>;
  employees: Array<{ id: string; name: string; weeklyHours: string }>;
  thresholdPercent: number;
}): OvertimeWarning[] {
  const planned = new Map<string, number>();

  for (const shift of input.shifts) {
    if (!shift.employeeId || !shift.startTime || !shift.endTime) continue;

    planned.set(shift.employeeId, (planned.get(shift.employeeId) ?? 0) + shiftNetMinutes(shift.startTime, shift.endTime, shift.breakMinutes ?? 0));
  }

  return input.employees
    .flatMap((employee): OvertimeWarning[] => {
      const hours = parseWeeklyHours(employee.weeklyHours);
      const minutes = planned.get(employee.id) ?? 0;

      if (!hours || minutes === 0) return [];

      const target = Math.round(hours * 60);

      return minutes > target * (1 + input.thresholdPercent / 100)
        ? [{ employeeId: employee.id, name: employee.name, plannedMinutes: minutes, targetMinutes: target }]
        : [];
    })
    .sort((a, b) => b.plannedMinutes - b.targetMinutes - (a.plannedMinutes - a.targetMinutes));
}
