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
