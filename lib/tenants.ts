import { prisma } from "@/lib/prisma";

export const tenantRoles = {
  owner: "OWNER",
  employee: "EMPLOYEE",
} as const;

export type TenantRole = (typeof tenantRoles)[keyof typeof tenantRoles];

const reservedTenantSlugs = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "login",
  "ployo",
  "register",
  "select",
]);

const tenantPlans = ["starter", "professional", "business"] as const;
const billingCycles = ["monthly", "yearly"] as const;

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

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function optionalString(value: string | undefined, maxLength = 255) {
  const trimmed = value?.trim();

  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeCode(value: string | undefined, fallback: string, maxLength = 64) {
  const normalized = optionalString(value, maxLength);

  return normalized ?? fallback;
}

function normalizePlan(value: string | undefined): TenantPlan {
  return tenantPlans.includes(value as TenantPlan)
    ? (value as TenantPlan)
    : "professional";
}

function normalizeBillingCycle(value: string | undefined): BillingCycle {
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
  return prisma.tenantMembership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      tenant: true,
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

  return prisma.tenant.create({
    data: {
      name,
      slug,
      country: normalizeCode(input.country, "DE"),
      timezone: normalizeCode(input.timezone, "Europe/Berlin"),
      size: optionalString(input.size, 64),
      industry: optionalString(input.industry),
      contactEmail: normalizeEmail(input.contactEmail),
      logoUrl: optionalString(input.logoUrl, 250_000),
      primaryColor: normalizeCode(input.primaryColor, "#2A6FDB", 16),
      plan: normalizePlan(input.plan),
      billingCycle: normalizeBillingCycle(input.billingCycle),
      invitations: {
        create: Array.from(invitationsByEmail.values()),
      },
      memberships: {
        create: {
          userId: input.userId,
          role: tenantRoles.owner,
        },
      },
    },
    include: {
      invitations: true,
      memberships: true,
    },
  });
}
