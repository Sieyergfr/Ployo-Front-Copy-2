import { getBillingBlockReason, isStripeConfiguredForBilling, tenantBillingSelect, type BillingBlockReason } from "@/lib/billing-access";
import { prisma } from "@/lib/prisma";

/**
 * Daten der Unternehmensauswahl (/select): Mandanten des angemeldeten
 * Nutzers mit Rolle, Mitarbeiterzahl und Abo-Zustand sowie offene
 * Einladungen an seine E-Mail-Adresse. Nur Lesezugriff auf eigene Daten.
 */

export type TenantSelectEntry = {
  id: string;
  slug: string;
  name: string;
  role: "OWNER" | "ADMIN" | "HR" | "EMPLOYEE";
  roleName: string | null;
  employeeCount: number;
  plan: string;
  billing:
    | { state: "active" }
    | { state: "trial"; daysLeft: number }
    | { state: "blocked"; reason: BillingBlockReason }
    | { state: "none" };
  canManageBilling: boolean;
};

export type TenantSelectInvitation = {
  token: string;
  tenantName: string;
  invitedByName: string;
  role: string;
};

const DAY_MS = 86_400_000;

export async function getTenantSelectOverview(user: { id: string; email: string }) {
  const memberships = await prisma.tenantMembership.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      roleRef: { select: { name: true } },
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true,
          plan: true,
          stripeCurrentPeriodEnd: true,
          ...tenantBillingSelect,
        },
      },
    },
  });
  const tenantIds = memberships.map((membership) => membership.tenant.id);
  const [counts, invitations] = await Promise.all([
    tenantIds.length
      ? prisma.tenantEmployee.groupBy({
          by: ["tenantId"],
          where: { tenantId: { in: tenantIds }, status: { not: "former" } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.tenantInvitation.findMany({
      where: {
        email: user.email.trim().toLowerCase(),
        status: "PENDING",
        tenantId: { notIn: tenantIds },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      select: { token: true, role: true, invitedByName: true, tenant: { select: { name: true } } },
    }),
  ]);
  const countByTenant = new Map(counts.map((entry) => [entry.tenantId, entry._count._all]));
  const stripeConfigured = isStripeConfiguredForBilling();
  const now = Date.now();

  const tenants: TenantSelectEntry[] = memberships.map(({ role, roleRef, tenant }) => {
    const reason = getBillingBlockReason(tenant, stripeConfigured);
    const billing: TenantSelectEntry["billing"] = reason
      ? { state: "blocked", reason }
      : tenant.stripeSubscriptionStatus === "trialing"
        ? {
            state: "trial",
            daysLeft: Math.max(0, Math.ceil(((tenant.stripeCurrentPeriodEnd?.getTime() ?? now) - now) / DAY_MS)),
          }
        : tenant.stripeSubscriptionStatus
          ? { state: "active" }
          : { state: "none" };

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      role,
      roleName: roleRef?.name ?? null,
      employeeCount: countByTenant.get(tenant.id) ?? 0,
      plan: tenant.plan,
      billing,
      canManageBilling: role === "OWNER" || role === "ADMIN",
    };
  });

  return {
    tenants,
    invitations: invitations.map((invitation) => ({
      token: invitation.token,
      tenantName: invitation.tenant.name,
      invitedByName: invitation.invitedByName,
      role: invitation.role,
    })) satisfies TenantSelectInvitation[],
  };
}
