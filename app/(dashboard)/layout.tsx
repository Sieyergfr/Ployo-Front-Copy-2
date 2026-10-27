import DashboardShell from "@/components/navigation/DashboardShell";
import type { NavigationTenantItem } from "@/components/navigation/types";
import { auth } from "@/lib/auth";
import { getOwnScheduledDeletion } from "@/lib/account-service";
import { computePermissionLevels } from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./dashboard.css";

const tenantMarkColors = ["#2a6fdb", "#c9622a", "#168a8a", "#8b6ed4"];

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "U";
}

function getRoleLabel(role: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (role === "OWNER") {
    return t("roleOwner");
  }

  if (role === "ADMIN") {
    return t("roleAdmin");
  }

  if (role === "HR") {
    return t("roleHR");
  }

  return t("roleEmployee");
}

export default async function AuthLayout ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user?.id) {
        redirect("/login");
    }

    if (await getOwnScheduledDeletion()) {
        redirect("/konto-loeschung");
    }

    const t = await getTranslations("DashboardLayout");
    const memberships = await getTenantsForUser(session.user.id);
    const tenants: NavigationTenantItem[] = memberships.map((membership, index) => ({
        name: membership.tenant.name,
        role: getRoleLabel(membership.role, t),
        mark: getInitials(membership.tenant.name),
        href: `/u/${membership.tenant.slug}`,
        color: tenantMarkColors[index % tenantMarkColors.length],
        slug: membership.tenant.slug,
        permissions: computePermissionLevels(membership),
        country: membership.tenant.country,
        timezone: membership.tenant.timezone,
        size: membership.tenant.size ?? undefined,
        industry: membership.tenant.industry ?? undefined,
        contactEmail: membership.tenant.contactEmail ?? undefined,
        logoUrl: membership.tenant.logoUrl ?? undefined,
        primaryColor: membership.tenant.primaryColor,
        plan: membership.tenant.plan,
        billingCycle: membership.tenant.billingCycle,
        stripeSubscriptionStatus: membership.tenant.stripeSubscriptionStatus ?? undefined,
        stripeCancelAtPeriodEnd: membership.tenant.stripeCancelAtPeriodEnd,
        stripeCurrentPeriodEnd:
          membership.tenant.stripeCurrentPeriodEnd?.toISOString() ?? undefined,
        locations: membership.tenant.locations,
        settings: membership.tenant.settings
          ? {
              companyAddress: membership.tenant.settings.companyAddress,
              taxId: membership.tenant.settings.taxId,
              defaultLocationId: membership.tenant.settings.defaultLocationId,
              weekStart: membership.tenant.settings.weekStart,
              workHours: membership.tenant.settings.workHours,
              vacationDays: membership.tenant.settings.vacationDays,
              employeeNumberRequired:
                membership.tenant.settings.employeeNumberRequired,
              employeeNumberPrefix:
                membership.tenant.settings.employeeNumberPrefix,
              employeeNumberSuffix:
                membership.tenant.settings.employeeNumberSuffix,
              archiveFormerEmployees:
                membership.tenant.settings.archiveFormerEmployees,
              mailNotifications: membership.tenant.settings.mailNotifications,
              inAppNotifications: membership.tenant.settings.inAppNotifications,
              mobilePush: membership.tenant.settings.mobilePush,
              deadlineAlerts: membership.tenant.settings.deadlineAlerts,
              absenceAlerts: membership.tenant.settings.absenceAlerts,
              shiftAlerts: membership.tenant.settings.shiftAlerts,
              digestTime: membership.tenant.settings.digestTime,
              twoFactorRequired: membership.tenant.settings.twoFactorRequired,
              sessionTimeout: membership.tenant.settings.sessionTimeout,
              auditRetentionMonths:
                membership.tenant.settings.auditRetentionMonths,
              timeTrackingEnabled: membership.tenant.settings.timeTrackingEnabled,
              timeTrackingBreaksEnabled: membership.tenant.settings.timeTrackingBreaksEnabled,
              timeTrackingAutoBreakDeduction:
                membership.tenant.settings.timeTrackingAutoBreakDeduction,
              timeTrackingClockInMode: membership.tenant.settings.timeTrackingClockInMode,
              timeTrackingClockInLeadMinutes:
                membership.tenant.settings.timeTrackingClockInLeadMinutes,
              timeTrackingReminderPush: membership.tenant.settings.timeTrackingReminderPush,
              timeTrackingAutoClockOut: membership.tenant.settings.timeTrackingAutoClockOut,
              timeTrackingAutoClockOutAfterShiftMinutes:
                membership.tenant.settings.timeTrackingAutoClockOutAfterShiftMinutes,
              timeTrackingAutoClockOutMaxHours:
                membership.tenant.settings.timeTrackingAutoClockOutMaxHours,
              timeTrackingQrRequired: membership.tenant.settings.timeTrackingQrRequired,
              timeTrackingQrRequiredClockOut: membership.tenant.settings.timeTrackingQrRequiredClockOut,
            }
          : undefined,
    }));

    return (
        <DashboardShell
            tenants={tenants}
            user={{
                name: session.user.name || session.user.email,
                email: session.user.email,
                initials: getInitials(session.user.name || session.user.email),
            }}
        >
            {children}
        </DashboardShell>
    )
}
