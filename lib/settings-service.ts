import { auth } from "@/lib/auth";
import { normalizeAddressInput, type AddressInput } from "@/lib/address";
import { recordTenantAudit } from "@/lib/audit";
import { isEmailConfigured, sendInvitationEmail } from "@/lib/email";
import { buildInvitationUrl } from "@/lib/invitation-service";
import { prisma } from "@/lib/prisma";
import { parseShiftPresets } from "@/lib/shift-presets";
import { isReservedTenantSlug, normalizeLogoUrl, slugify } from "@/lib/tenants";
import { headers } from "next/headers";
import { requireTenantAccess } from "@/lib/tenant-access";

const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

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

/**
 * Benachrichtigungs-Schalter für die In-App-Anzeige. Bewusst über die
 * Mandantenmitgliedschaft geladen (kein settings-Recht nötig), da jeder
 * Nutzer seine eigenen Hinweise sieht.
 */
export async function getNotificationPreferences(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "employees", "read");
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: access.tenantId },
    select: {
      inAppNotifications: true,
      deadlineAlerts: true,
      absenceAlerts: true,
      shiftAlerts: true,
    },
  });

  return {
    inAppNotifications: settings?.inAppNotifications ?? true,
    deadlineAlerts: settings?.deadlineAlerts ?? true,
    absenceAlerts: settings?.absenceAlerts ?? true,
    shiftAlerts: settings?.shiftAlerts ?? true,
  };
}

export async function updateTenantShiftSettings(input: {
  tenantSlug: string;
  weekStart?: string;
  minStaffing?: string;
  breakRule?: string;
  presetsJson?: string;
}) {
  const access = await requireSettingsManager(input.tenantSlug);

  await ensureTenantSettings(access.tenantId);

  const presets = parseShiftPresets(input.presetsJson ?? "[]");

  return prisma.tenantSettings.update({
    where: { tenantId: access.tenantId },
    data: {
      weekStart: input.weekStart === "sunday" ? "sunday" : "monday",
      shiftMinStaffing: normalizeInt(input.minStaffing, 3),
      shiftBreakRule: optionalString(input.breakRule, 16) || "30-6",
      shiftPresetsJson: JSON.stringify(presets),
    },
  });
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
      logoUrl: normalizeLogoUrl(input.logoUrl),
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

  const updated = await prisma.tenantSettings.update({
    where: { tenantId: access.tenantId },
    data: {
      // 2FA und Session-Timeout sind noch nicht implementiert; die Spalten
      // werden hier bewusst nicht überschrieben, solange die Oberfläche
      // keine Schalter dafür anbietet.
      ...(input.twoFactorRequired === undefined
        ? {}
        : { twoFactorRequired: normalizeBool(input.twoFactorRequired) }),
      ...(input.sessionTimeout === undefined
        ? {}
        : { sessionTimeout: normalizeBool(input.sessionTimeout) }),
      auditRetentionMonths: normalizeInt(input.auditRetentionMonths, 24),
    },
  });

  const session = await auth.api.getSession({ headers: await headers() });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: session?.user?.name || session?.user?.email || "System",
    action: "Sicherheitseinstellungen geändert",
    source: "Einstellungen",
    entityType: "settings",
    entityId: updated.id,
    detail: `Audit-Aufbewahrung: ${updated.auditRetentionMonths} Monate`,
  });

  return updated;
}

export async function createTenantInvitation(input: {
  tenantSlug: string;
  email: string;
  role: string;
  source?: string;
}) {
  const access = await requireSettingsManager(input.tenantSlug);
  const email = normalizeEmail(input.email);
  const role = input.role === "ADMIN" || input.role === "HR" ? input.role : "EMPLOYEE";

  if (!email) {
    throw new Error("Gültige E-Mail ist erforderlich.");
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const invitedByName = session?.user?.name || session?.user?.email || "";
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const token = crypto.randomUUID();

  const invitation = await prisma.tenantInvitation.upsert({
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
      token,
      expiresAt,
      invitedByName,
    },
    update: {
      role,
      status: "PENDING",
      token,
      expiresAt,
      acceptedAt: null,
      invitedByName,
    },
    include: {
      tenant: { select: { name: true } },
    },
  });

  if (isEmailConfigured()) {
    try {
      await sendInvitationEmail({
        to: email,
        tenantName: invitation.tenant.name,
        url: buildInvitationUrl(invitation.token),
      });
    } catch (error) {
      console.error("[invitation] E-Mail-Versand fehlgeschlagen:", error);
    }
  }

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: invitedByName || "System",
    action: "Einladung erstellt",
    source: input.source ?? "Einstellungen",
    entityType: "invitation",
    entityId: invitation.id,
    detail: `${email} (${role})`,
  });

  return invitation;
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
