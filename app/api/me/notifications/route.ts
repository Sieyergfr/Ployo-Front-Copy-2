import { auth } from "@/lib/auth";
import { getEmployeesForTenant, getEmployeeLimitForTenant } from "@/lib/employee-service";
import { getRemindersForTenant } from "@/lib/reminders";
import { getISOWeekFromDate, getShiftPlanForTenant } from "@/lib/shift-service";
import { getVacationRequestsForTenant } from "@/lib/vacation-service";
import { getNotificationPreferences } from "@/lib/settings-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/** Bereiche ohne Berechtigung werden still übersprungen. */
async function tryLoad<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json(
      { notifications: [], usage: null },
      { status: 401 },
    );
  }

  const tenant = new URL(request.url).searchParams.get("tenant")?.trim();

  if (!tenant) {
    return NextResponse.json({ notifications: [], usage: null });
  }

  // Wird bei jedem Seitenwechsel aus der Sidebar aufgerufen.
  const limit = await checkRateLimit({
    key: `me-notifications:${session.user.id}`,
    limit: 120,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const { year, week } = getISOWeekFromDate(new Date());
  const [vacations, reminders, shiftPlan, employees, preferences, employeeLimit] =
    await Promise.all([
      tryLoad(getVacationRequestsForTenant(tenant)),
      tryLoad(getRemindersForTenant(tenant)),
      tryLoad(getShiftPlanForTenant({ tenantSlug: tenant, year, week })),
      tryLoad(getEmployeesForTenant(tenant)),
      tryLoad(getNotificationPreferences(tenant)),
      tryLoad(getEmployeeLimitForTenant(tenant)),
    ]);

  const notifications: Array<{
    id: string;
    title: string;
    detail: string;
    time: string;
    category: string;
  }> = [];

  // Die Mandanten-Einstellungen steuern, welche Hinweise in der App
  // überhaupt erscheinen.
  const inAppEnabled = preferences?.inAppNotifications ?? true;
  const absenceAlerts = inAppEnabled && (preferences?.absenceAlerts ?? true);
  const deadlineAlerts = inAppEnabled && (preferences?.deadlineAlerts ?? true);
  const shiftAlerts = inAppEnabled && (preferences?.shiftAlerts ?? true);

  for (const vacationRequest of (absenceAlerts ? vacations ?? [] : [])
    .filter((item) => item.status === "pending")
    .slice(0, 3)) {
    notifications.push({
      id: `vacation-${vacationRequest.id}`,
      title: "Urlaubsantrag wartet",
      detail: `${vacationRequest.name} hat Urlaub vom ${vacationRequest.startDate} bis ${vacationRequest.endDate} beantragt.`,
      time: vacationRequest.days,
      category: "Freigabe",
    });
  }

  for (const reminder of (deadlineAlerts ? reminders ?? [] : [])
    .filter((item) => item.daysLeft <= 7)
    .slice(0, 3)) {
    notifications.push({
      id: `reminder-${reminder.id}`,
      title: "Frist läuft ab",
      detail:
        reminder.daysLeft <= 0
          ? `„${reminder.title}“ ist überfällig.`
          : `„${reminder.title}“ ist in ${reminder.daysLeft} Tagen fällig.`,
      time: reminder.dueDate,
      category: "Frist",
    });
  }

  if (shiftAlerts && shiftPlan && shiftPlan.conflictCount > 0) {
    notifications.push({
      id: `shifts-${year}-${week}`,
      title: "Schichtkonflikte erkannt",
      detail: `${shiftPlan.conflictCount} Konflikte in ${shiftPlan.label}.`,
      time: shiftPlan.range,
      category: "Planung",
    });
  }

  const usage = employees
    ? {
        employeeTotal: employees.length,
        activeEmployees: employees.filter(
          (employee) => employee.status === "active",
        ).length,
        employeeLimit: employeeLimit ?? null,
      }
    : null;

  return NextResponse.json({ notifications, usage });
}
