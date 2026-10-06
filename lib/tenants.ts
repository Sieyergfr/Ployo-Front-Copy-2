import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isEmailConfigured, sendInvitationEmail } from "@/lib/email";
import { buildInvitationUrl } from "@/lib/invitation-service";
import { logger } from "@/lib/logger";
import { buildRolePermissionCreateData, permissionRoles } from "@/lib/roles";
import { slugify } from "@/lib/slug";
import { isKnownTenantIndustry, isKnownTenantSize } from "@/lib/tenant-options";
import { headers } from "next/headers";

export { slugify };

const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const tenantRoles = {
  owner: "OWNER",
  employee: "EMPLOYEE",
} as const;

export type TenantRole = (typeof tenantRoles)[keyof typeof tenantRoles];

const reservedTenantSlugs = new Set([
  "admin",
  "agb",
  "api",
  "app",
  "auth",
  "datenschutz",
  "impressum",
  "invite",
  "login",
  "logout",
  "ployo",
  "register",
  "select",
]);

export const tenantPlans = ["starter", "professional", "business"] as const;
export const billingCycles = ["monthly", "yearly"] as const;

export type TenantPlan = (typeof tenantPlans)[number];
export type BillingCycle = (typeof billingCycles)[number];
export type InviteRole = "ADMIN" | "HR" | "EMPLOYEE";

export type CreateTenantInput = {
  name: string;
  userId: string;
  slug?: string;
  country?: string;
  timezone?: string;
  size?: string;
  industry?: string;
  contactEmail?: string;
  logoUrl?: string;
  primaryColor?: string;
  plan?: string;
  billingCycle?: string;
  invitations?: Array<{
    email?: string;
    role?: string;
  }>;
};

function optionalString(value: string | undefined, maxLength = 255) {
  const trimmed = value?.trim();

  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeCode(value: string | undefined, fallback: string, maxLength = 64) {
  const normalized = optionalString(value, maxLength);

  return normalized ?? fallback;
}

function normalizeTenantSize(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed && isKnownTenantSize(trimmed) ? trimmed : null;
}

function normalizeTenantIndustry(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed && isKnownTenantIndustry(trimmed) ? trimmed : null;
}

export function normalizePlan(value: string | undefined): TenantPlan {
  return tenantPlans.includes(value as TenantPlan)
    ? (value as TenantPlan)
    : "professional";
}

export function normalizeBillingCycle(value: string | undefined): BillingCycle {
  return billingCycles.includes(value as BillingCycle)
    ? (value as BillingCycle)
    : "monthly";
}

function normalizeInviteRole(value: string | undefined): InviteRole {
  const normalized = value?.trim().toUpperCase();

  if (normalized === "ADMIN") {
    return "ADMIN";
  }

  if (normalized === "HR") {
    return "HR";
  }

  return "EMPLOYEE";
}

function normalizeEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  return email.slice(0, 255);
}

/**
 * Erlaubt nur https-URLs oder eingebettete Bilder (data:image/*),
 * damit kein beliebiger String als <img src> gerendert wird.
 */
export function normalizeLogoUrl(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image/")) {
    // Abschneiden würde die Bilddaten beschädigen — bei Überlänge lieber
    // ganz ablehnen (siehe MAX_LOGO_FILE_BYTES im CompanyCreateWizard).
    return trimmed.length <= 250_000 ? trimmed : null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol === "https:") {
      return trimmed.slice(0, 2_048);
    }
  } catch {
    // kein gültiges URL-Format
  }

  return null;
}

export function isReservedTenantSlug(slug: string) {
  return reservedTenantSlugs.has(slug);
}

export async function isTenantSlugAvailable(slug: string) {
  const normalizedSlug = slugify(slug);

  if (!normalizedSlug || isReservedTenantSlug(normalizedSlug)) {
    return false;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: normalizedSlug },
    select: { id: true },
  });

  return !tenant;
}

export async function createUniqueTenantSlug(name: string) {
  const baseSlug = slugify(name) || "unternehmen";
  let slug = baseSlug;
  let suffix = 2;

  while (
    isReservedTenantSlug(slug) ||
    (await prisma.tenant.findUnique({ where: { slug } }))
  ) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

export async function getTenantsForUser(userId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  if (session.user.id !== userId) throw new Error("FORBIDDEN");

  return prisma.tenantMembership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      roleRef: {
        select: {
          permissions: { select: { area: true, level: true } },
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          country: true,
          timezone: true,
          size: true,
          industry: true,
          contactEmail: true,
          logoUrl: true,
          primaryColor: true,
          plan: true,
          billingCycle: true,
          stripeSubscriptionStatus: true,
          stripeCancelAtPeriodEnd: true,
          stripeCurrentPeriodEnd: true,
          locations: {
            where: { status: "active" },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          },
          settings: {
            select: {
              taxId: true,
              defaultLocationId: true,
              weekStart: true,
              workHours: true,
              vacationDays: true,
              employeeNumberRequired: true,
              employeeNumberPrefix: true,
              employeeNumberSuffix: true,
              archiveFormerEmployees: true,
              mailNotifications: true,
              inAppNotifications: true,
              mobilePush: true,
              deadlineAlerts: true,
              absenceAlerts: true,
              shiftAlerts: true,
              digestTime: true,
              twoFactorRequired: true,
              sessionTimeout: true,
              auditRetentionMonths: true,
              timeTrackingEnabled: true,
              timeTrackingBreaksEnabled: true,
              timeTrackingAutoBreakDeduction: true,
              timeTrackingClockInMode: true,
              timeTrackingClockInLeadMinutes: true,
              timeTrackingReminderPush: true,
              timeTrackingAutoClockOut: true,
              timeTrackingAutoClockOutAfterShiftMinutes: true,
              timeTrackingAutoClockOutMaxHours: true,
              companyAddress: {
                select: {
                  street: true,
                  houseNumber: true,
                  postalCode: true,
                  city: true,
                  careOf: true,
                  country: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function createTenantForOwner(input: CreateTenantInput) {
  const name = input.name.trim();
  const requestedSlug = input.slug ? slugify(input.slug) : null;
  const slug = requestedSlug || (await createUniqueTenantSlug(name));

  if (requestedSlug && !(await isTenantSlugAvailable(requestedSlug))) {
    throw new Error("TENANT_SLUG_TAKEN");
  }

  const invitationsByEmail = new Map(
    input.invitations
      ?.map((invitation) => ({
        email: normalizeEmail(invitation.email),
        role: normalizeInviteRole(invitation.role),
      }))
      .filter(
        (invitation): invitation is { email: string; role: InviteRole } =>
          Boolean(invitation.email),
      )
      .map((invitation) => [invitation.email, invitation]) ?? [],
  );

  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      country: normalizeCode(input.country, "DE"),
      timezone: normalizeCode(input.timezone, "Europe/Berlin"),
      size: normalizeTenantSize(input.size),
      industry: normalizeTenantIndustry(input.industry),
      contactEmail: normalizeEmail(input.contactEmail),
      logoUrl: normalizeLogoUrl(input.logoUrl),
      primaryColor: normalizeCode(input.primaryColor, "#2A6FDB", 16),
      plan: normalizePlan(input.plan),
      billingCycle: normalizeBillingCycle(input.billingCycle),
      invitations: {
        create: Array.from(invitationsByEmail.values()).map((invitation) => ({
          ...invitation,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        })),
      },
      memberships: {
        create: {
          userId: input.userId,
          role: tenantRoles.owner,
        },
      },
      // Atomar mit dem Tenant selbst anlegen — sonst existieren die
      // System-Rollen bis zum ersten Rollen-Seitenaufruf oder zur ersten
      // angenommenen Einladung nicht, und ein davon abweichender,
      // unvollständiger Anlegepfad kann Scope/Fähigkeiten auf den
      // Prisma-Feld-Default statt das Template fallen lassen (Audit-Finding
      // C01). `permissionRoles`/`buildRolePermissionCreateData` sind das
      // einzige kanonische Template für alle Rollen-Anlagepfade.
      roles: {
        create: permissionRoles.map((role) => ({
          key: role.key,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          appOverviewEnabled: role.appOverviewEnabled,
          permissions: {
            create: buildRolePermissionCreateData(role),
          },
        })),
      },
    },
    include: {
      invitations: true,
      memberships: true,
    },
  });

  if (isEmailConfigured()) {
    for (const invitation of tenant.invitations) {
      try {
        await sendInvitationEmail({
          to: invitation.email,
          tenantName: tenant.name,
          url: buildInvitationUrl(invitation.token),
        });
      } catch (error) {
        logger.error("Einladungs-E-Mail-Versand fehlgeschlagen.", {
          to: invitation.email,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return tenant;
}
