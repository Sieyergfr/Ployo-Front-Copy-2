import "server-only";

import { getOwnPreferences } from "@/lib/account-service";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseShiftPresets } from "@/lib/shift-presets";
import { parseOpeningHoursDays } from "@/lib/opening-hours";
import { isStripeConfigured } from "@/lib/stripe/client";
import { computePermissionLevels } from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { headers } from "next/headers";

/**
 * Daten der Einstellungsseite — dieselbe Quelle wie die Seitenleiste
 * (`getTenantsForUser`), ergänzt um die Felder, die der bisherige Dialog
 * nicht kannte (Schichtplanung, Feiertage, persönliche Präferenzen).
 */
export async function getSettingsPageData(tenantSlug: string) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const memberships = await getTenantsForUser(session.user.id);
  const membership = memberships.find((item) => item.tenant.slug === tenantSlug);

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  const tenantId = membership.tenant.id;
  const [settings, preferences, locations, employees] = await Promise.all([
    prisma.tenantSettings.findUnique({ where: { tenantId } }),
    getOwnPreferences(),
    prisma.tenantLocation.findMany({
      where: { tenantId },
      select: { id: true, name: true, bundesland: true },
      orderBy: { name: "asc" },
    }),
    prisma.tenantEmployee.groupBy({ by: ["status"], where: { tenantId }, _count: true }),
  ]);
  const { getEmployeeLimitForTenant } = await import("@/lib/employee-service");
  const employeeLimit = await getEmployeeLimitForTenant(tenantSlug).catch(() => null);

  return {
    user: {
      id: session.user.id,
      name: session.user.name || session.user.email,
      email: session.user.email,
    },
    role: membership.role,
    permissions: computePermissionLevels(membership),
    tenant: {
      id: tenantId,
      name: membership.tenant.name,
      slug: membership.tenant.slug,
      country: membership.tenant.country,
      timezone: membership.tenant.timezone,
      size: membership.tenant.size ?? "",
      industry: membership.tenant.industry ?? "",
      contactEmail: membership.tenant.contactEmail ?? "",
      logoUrl: membership.tenant.logoUrl ?? "",
      primaryColor: membership.tenant.primaryColor,
      plan: membership.tenant.plan,
      billingCycle: membership.tenant.billingCycle,
      stripeSubscriptionStatus: membership.tenant.stripeSubscriptionStatus ?? null,
      stripeCancelAtPeriodEnd: membership.tenant.stripeCancelAtPeriodEnd,
      stripeCurrentPeriodEnd: membership.tenant.stripeCurrentPeriodEnd?.toISOString() ?? null,
      companyAddress: membership.tenant.settings?.companyAddress ?? null,
    },
    settings: settings
      ? {
          taxId: settings.taxId,
          defaultLocationId: settings.defaultLocationId,
          weekStart: settings.weekStart,
          workHours: settings.workHours,
          vacationDays: settings.vacationDays,
          employeeNumberRequired: settings.employeeNumberRequired,
          employeeNumberPrefix: settings.employeeNumberPrefix,
          employeeNumberSuffix: settings.employeeNumberSuffix,
          archiveFormerEmployees: settings.archiveFormerEmployees,
          mailNotifications: settings.mailNotifications,
          inAppNotifications: settings.inAppNotifications,
          mobilePush: settings.mobilePush,
          deadlineAlerts: settings.deadlineAlerts,
          absenceAlerts: settings.absenceAlerts,
          shiftAlerts: settings.shiftAlerts,
          digestTime: settings.digestTime,
          twoFactorRequired: settings.twoFactorRequired,
          auditRetentionMonths: settings.auditRetentionMonths,
          timeTrackingEnabled: settings.timeTrackingEnabled,
          timeTrackingBreaksEnabled: settings.timeTrackingBreaksEnabled,
          timeTrackingAutoBreakDeduction: settings.timeTrackingAutoBreakDeduction,
          timeTrackingClockInMode: settings.timeTrackingClockInMode,
          timeTrackingClockInLeadMinutes: settings.timeTrackingClockInLeadMinutes,
          timeTrackingReminderPush: settings.timeTrackingReminderPush,
          timeTrackingAutoClockOut: settings.timeTrackingAutoClockOut,
          timeTrackingAutoClockOutAfterShiftMinutes: settings.timeTrackingAutoClockOutAfterShiftMinutes,
          timeTrackingAutoClockOutMaxHours: settings.timeTrackingAutoClockOutMaxHours,
          timeTrackingQrRequired: settings.timeTrackingQrRequired,
          timeTrackingQrRequiredClockOut: settings.timeTrackingQrRequiredClockOut,
          shiftMinStaffing: settings.shiftMinStaffing,
          shiftBreakRule: settings.shiftBreakRule,
          minRestHours: settings.minRestHours,
          maxShiftHours: settings.maxShiftHours,
          overtimeWarningPercent: settings.overtimeWarningPercent,
          shiftNotifyOnPublish: settings.shiftNotifyOnPublish,
          shiftPresets: parseShiftPresets(settings.shiftPresetsJson),
          defaultOpeningHours: parseOpeningHoursDays(settings.defaultOpeningHoursJson),
        }
      : null,
    preferences,
    locations,
    usage: {
      activeEmployees: employees.find((group) => group.status === "active")?._count ?? 0,
      employeeTotal: employees.reduce((sum, group) => sum + group._count, 0),
      employeeLimit: employeeLimit ?? null,
    },
    stripeConfigured: isStripeConfigured(),
  };
}

export type SettingsPageData = Awaited<ReturnType<typeof getSettingsPageData>>;
