import { auth } from "@/lib/auth";
import { normalizeAddressInput, type AddressInput } from "@/lib/address";
import { prisma } from "@/lib/prisma";
import { isReservedTenantSlug, slugify } from "@/lib/tenants";
import { headers } from "next/headers";
import { requireTenantAccess } from "@/lib/tenant-access";

export type TenantSettingsView = Awaited<ReturnType<typeof getTenantSettings>>;

const plans = ["starter", "professional", "business"];
const billingCycles = ["monthly", "yearly"];

function optionalString(value: string | undefined, maxLength = 255) {
  const trimmed = value?.trim();

  return trimmed ? trimmed.slice(0, maxLength) : "";
}

function optionalNullableString(value: string | undefined, maxLength = 255) {
  const trimmed = optionalString(value, maxLength);

  return trimmed || null;
}

function normalizeEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  return email.slice(0, 255);
}

function normalizePlan(value: string | undefined) {
  return plans.includes(value ?? "") ? value : "professional";
}

function normalizeBillingCycle(value: string | undefined) {
  return billingCycles.includes(value ?? "") ? value : "monthly";
}

function normalizeBool(value: boolean | undefined) {
  return Boolean(value);
}

function normalizeInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function getSessionUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.id ?? null;
}

export async function requireSettingsManager(tenantSlug: string) {
  await requireTenantAccess(tenantSlug, "settings", "write");
  const userId = await getSessionUserId();

  if (!userId) {
    throw new Error("Nicht angemeldet.");
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      tenant: { slug: tenantSlug },
    },
    select: {
      role: true,
      tenant: { select: { id: true, slug: true } },
      roleRef: {
        select: {
          permissions: {
            where: { area: "settings" },
            select: { level: true },
          },
        },
      },
    },
  });

  if (!membership) {
    throw new Error("Keine Berechtigung fuer diesen Mandanten.");
  }

  const legacyRole = membership.role.toUpperCase();
  const permission = membership.roleRef?.permissions[0]?.level ?? "none";

  if (
    legacyRole === "OWNER" ||
    legacyRole === "ADMIN" ||
    permission === "write" ||
    permission === "admin"
  ) {
    return {
      tenantId: membership.tenant.id,
      tenantSlug: membership.tenant.slug,
      userId,
    };
  }

  throw new Error("Keine Berechtigung zum Bearbeiten von Einstellungen.");
}

async function ensureTenantSettings(tenantId: string) {
  return prisma.tenantSettings.upsert({
    where: { tenantId },
    create: { tenantId },
    update: {},
    include: {
      companyAddress: true,
    },
  });
}

export async function getTenantSettings(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "settings", "read");
  const tenant = await prisma.tenant.findUnique({
    where: { id: access.tenantId },
    include: {
      invitations: {
        orderBy: { createdAt: "desc" },
      },
      settings: {
        include: {
          companyAddress: true,
        },
      },
    },
  });

  if (!tenant) {
    return null;
  }

  const settings = tenant.settings ?? (await ensureTenantSettings(tenant.id));

  return {
    tenant,
    settings,
  };
}

export async function updateTenantProfile(input: {
  tenantSlug: string;
  name: string;
  slug: string;
  country?: string;
  timezone?: string;
  size?: string;
  industry?: string;
  contactEmail?: string;
  logoUrl?: string;
  primaryColor?: string;
  plan?: string;
  billingCycle?: string;
}) {
  const access = await requireSettingsManager(input.tenantSlug);
  const nextSlug = slugify(input.slug);

  if (!input.name.trim()) {
    throw new Error("Unternehmensname ist erforderlich.");
  }

  if (!nextSlug || isReservedTenantSlug(nextSlug)) {
    throw new Error("Diese Arbeitsbereich-URL ist nicht erlaubt.");
  }

  const slugOwner = await prisma.tenant.findFirst({
    where: {
      slug: nextSlug,
      id: { not: access.tenantId },
    },
    select: { id: true },
  });

  if (slugOwner) {
    throw new Error("Diese Arbeitsbereich-URL ist bereits vergeben.");
  }

  return prisma.tenant.update({
    where: { id: access.tenantId },
    data: {
      name: input.name.trim(),
      slug: nextSlug,
      country: optionalString(input.country, 64) || "DE",
      timezone: optionalString(input.timezone, 64) || "Europe/Berlin",
      size: optionalNullableString(input.size, 64),
      industry: optionalNullableString(input.industry),
      contactEmail: normalizeEmail(input.contactEmail),
      logoUrl: optionalNullableString(input.logoUrl, 250_000),
      primaryColor: optionalString(input.primaryColor, 16) || "#2A6FDB",
      plan: normalizePlan(input.plan),
      billingCycle: normalizeBillingCycle(input.billingCycle),
    },
  });
}

export async function updateTenantDefaults(input: {
  tenantSlug: string;
  companyAddress?: AddressInput;
  taxId?: string;
  defaultLocationId?: string;
  weekStart?: string;
  workHours?: string;
  vacationDays?: string;
  employeeNumberRequired?: boolean;
  archiveFormerEmployees?: boolean;
}) {
  const access = await requireSettingsManager(input.tenantSlug);

  await ensureTenantSettings(access.tenantId);

  return prisma.tenantSettings.update({
    where: { tenantId: access.tenantId },
    data: {
      companyAddress: {
        upsert: {
          create: normalizeAddressInput(input.companyAddress),
          update: normalizeAddressInput(input.companyAddress),
        },
      },
      taxId: optionalString(input.taxId, 64),
      defaultLocationId: optionalString(input.defaultLocationId, 128),
      weekStart: input.weekStart === "sunday" ? "sunday" : "monday",
      workHours: optionalString(input.workHours, 64) || "40 Stunden pro Woche",
      vacationDays: normalizeInt(input.vacationDays, 30),
      employeeNumberRequired: normalizeBool(input.employeeNumberRequired),
      archiveFormerEmployees: normalizeBool(input.archiveFormerEmployees),
    },
  });
}

export async function updateTenantNotifications(input: {
  tenantSlug: string;
  mailNotifications?: boolean;
  inAppNotifications?: boolean;
  mobilePush?: boolean;
  deadlineAlerts?: boolean;
  absenceAlerts?: boolean;
  shiftAlerts?: boolean;
  digestTime?: string;
}) {
  const access = await requireSettingsManager(input.tenantSlug);

  await ensureTenantSettings(access.tenantId);

  return prisma.tenantSettings.update({
    where: { tenantId: access.tenantId },
    data: {
      mailNotifications: normalizeBool(input.mailNotifications),
      inAppNotifications: normalizeBool(input.inAppNotifications),
      mobilePush: normalizeBool(input.mobilePush),
      deadlineAlerts: normalizeBool(input.deadlineAlerts),
      absenceAlerts: normalizeBool(input.absenceAlerts),
      shiftAlerts: normalizeBool(input.shiftAlerts),
      digestTime: optionalString(input.digestTime, 64) || "monday-0800",
    },
  });
}

export async function updateTenantSecurity(input: {
  tenantSlug: string;
  twoFactorRequired?: boolean;
  sessionTimeout?: boolean;
  auditRetentionMonths?: string;
}) {
  const access = await requireSettingsManager(input.tenantSlug);

  await ensureTenantSettings(access.tenantId);

  return prisma.tenantSettings.update({
    where: { tenantId: access.tenantId },
    data: {
      twoFactorRequired: normalizeBool(input.twoFactorRequired),
      sessionTimeout: normalizeBool(input.sessionTimeout),
      auditRetentionMonths: normalizeInt(input.auditRetentionMonths, 24),
    },
  });
}

export async function createTenantInvitation(input: {
  tenantSlug: string;
  email: string;
  role: string;
}) {
  const access = await requireSettingsManager(input.tenantSlug);
  const email = normalizeEmail(input.email);
  const role = input.role === "ADMIN" || input.role === "HR" ? input.role : "EMPLOYEE";

  if (!email) {
    throw new Error("Gueltige E-Mail ist erforderlich.");
  }

  return prisma.tenantInvitation.upsert({
    where: {
      tenantId_email: {
        tenantId: access.tenantId,
        email,
      },
    },
    create: {
      tenantId: access.tenantId,
      email,
      role,
      status: "PENDING",
    },
    update: {
      role,
      status: "PENDING",
    },
  });
}

export async function deleteTenantInvitation(input: {
  tenantSlug: string;
  invitationId: string;
}) {
  const access = await requireSettingsManager(input.tenantSlug);
  const invitation = await prisma.tenantInvitation.findFirst({
    where: {
      id: input.invitationId,
      tenantId: access.tenantId,
    },
    select: { id: true },
  });

  if (!invitation) {
    throw new Error("Einladung nicht gefunden.");
  }

  await prisma.tenantInvitation.delete({
    where: { id: input.invitationId },
  });
}
