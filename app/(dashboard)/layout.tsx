import NavigationSidebar, {
  type NavigationTenantItem,
} from "@/components/Navigation";
import { auth } from "@/lib/auth";
import { getTenantsForUser } from "@/lib/tenants";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const tenantMarkClasses = [
  "sidebar-tenant-mark-blue",
  "sidebar-tenant-mark-green",
  "sidebar-tenant-mark-purple",
];

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "U";
}

function getRoleLabel(role: string) {
  if (role === "OWNER") {
    return "Inhaber";
  }

  if (role === "ADMIN") {
    return "Admin";
  }

  if (role === "HR") {
    return "HR";
  }

  return "Mitarbeiter";
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

    const memberships = await getTenantsForUser(session.user.id);
    const tenants: NavigationTenantItem[] = memberships.map((membership, index) => ({
        name: membership.tenant.name,
        role: getRoleLabel(membership.role),
        mark: getInitials(membership.tenant.name),
        href: `/u/${membership.tenant.slug}`,
        colorClass: tenantMarkClasses[index % tenantMarkClasses.length],
        slug: membership.tenant.slug,
        country: membership.tenant.country,
        timezone: membership.tenant.timezone,
        size: membership.tenant.size ?? undefined,
        industry: membership.tenant.industry ?? undefined,
        contactEmail: membership.tenant.contactEmail ?? undefined,
        logoUrl: membership.tenant.logoUrl ?? undefined,
        primaryColor: membership.tenant.primaryColor,
        plan: membership.tenant.plan,
        billingCycle: membership.tenant.billingCycle,
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
            }
          : undefined,
    }));

    return (
        <div className="fixed inset-0 flex w-full overflow-hidden">
            <NavigationSidebar tenants={tenants} />
            <main className="main-content">
                <div className="container">
                    {children}
                </div>
            </main>
        </div>
    )
}
