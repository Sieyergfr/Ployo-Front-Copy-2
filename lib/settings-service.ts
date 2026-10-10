import { auth } from "@/lib/auth";
import { normalizeAddressInput, type AddressInput } from "@/lib/address";
import { recordTenantAudit } from "@/lib/audit";
import { isEmailConfigured, sendInvitationEmail } from "@/lib/email";
import { buildInvitationUrl } from "@/lib/invitation-service";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseOpeningHoursDays } from "@/lib/opening-hours";
import { parseShiftPresets } from "@/lib/shift-presets";
import {
  isReservedTenantSlug,
  normalizeBillingCycle,
  normalizeLogoUrl,
  normalizePlan,
  slugify,
} from "@/lib/tenants";
import { headers } from "next/headers";
import { requireTenantAccess } from "@/lib/tenant-access";
import { isStripeConfigured } from "@/lib/stripe/client";
import { isClockInMode } from "@/lib/time-tracking";

const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type TenantSettingsView = Awaited<ReturnType<typeof getTenantSettings>>;

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

function normalizeBool(value: boolean | undefined) {
  return Boolean(value);
}

function normalizeInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const auditRetentionMonthOptions = new Set([12, 24, 60]);

// "<wochentag>-<HHMM>", z. B. "monday-0800" — Tag und Uhrzeit sind frei
// wählbar (siehe lib/notifications/digest-schedule.ts, das jeden Wochentag
// und jede Uhrzeit unterstützt), nur das Format muss stimmen.
const digestWeekdayPattern =
  /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)-([01]\d|2[0-3])([0-5]\d)$/;

function normalizeDigestTime(value: string | undefined) {
  const trimmed = value?.trim() ?? "";

  if (trimmed === "disabled" || digestWeekdayPattern.test(trimmed)) {
    return trimmed;
  }

  return "monday-0800";
}

function normalizeAuditRetentionMonths(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  return auditRetentionMonthOptions.has(parsed) ? parsed : 24;
}

// Format "<Minuten>-<Schwellenstunden>" (z. B. "30-6"), siehe lib/shift-break-rule.ts.
// "none" deaktiviert die automatische Pause. Deckt auch Kombinationen ab, die
// das Formular (aktuell 4 Presets) nicht anbietet, damit die Regel-Logik
// generisch bleibt — nur die Form wird geprüft, nicht eine feste Werteliste.
const BREAK_RULE_PATTERN = /^\d{1,3}-\d{1,3}$/;

function normalizeBreakRule(value: string | undefined) {
  const trimmed = value?.trim() ?? "";

  if (trimmed === "none" || BREAK_RULE_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return "30-6";
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
  defaultOpeningHoursJson?: string;
}) {
  const access = await requireSettingsManager(input.tenantSlug);

  await ensureTenantSettings(access.tenantId);

  let rawPresets: unknown = [];

  try {
    rawPresets = JSON.parse(input.presetsJson ?? "[]");
  } catch {
    rawPresets = [];
  }

  const presets = parseShiftPresets(rawPresets);

  let rawOpeningHours: unknown = [];

  try {
    rawOpeningHours = JSON.parse(input.defaultOpeningHoursJson ?? "[]");
  } catch {
    rawOpeningHours = [];
  }

  const defaultOpeningHours = parseOpeningHoursDays(rawOpeningHours);

  return prisma.tenantSettings.update({
    where: { tenantId: access.tenantId },
    data: {
      weekStart: input.weekStart === "sunday" ? "sunday" : "monday",
      shiftMinStaffing: normalizeInt(input.minStaffing, 3),
      shiftBreakRule: normalizeBreakRule(input.breakRule),
      shiftPresetsJson: presets,
      defaultOpeningHoursJson: defaultOpeningHours,
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
    throw new Error("Keine Berechtigung für diesen Mandanten.");
  }

  const role = membership.role;
  const permission = membership.roleRef?.permissions[0]?.level ?? "none";

  if (
    role === "OWNER" ||
    role === "ADMIN" ||
    permission === "write" ||
    permission === "admin"
  ) {
    return {
      tenantId: membership.tenant.id,
      tenantSlug: membership.tenant.slug,
      userId,
      role,
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

  // Sobald Stripe konfiguriert ist, lässt sich der Plan nicht mehr über diese
  // allgemeine Profil-Speicherung setzen — sonst könnte jeder mit
  // "settings:write" (nicht nur der Owner) sich per Formular auf einen
  // höheren, nicht bezahlten Plan setzen. Echte Wechsel laufen dann
  // ausschließlich über Checkout/Billing-Portal. Die Felder werden dafür aus
  // `data` ausgelassen (nicht auf einen Normalisierungs-Default gesetzt) —
  // sonst würde ein fehlendes `input.plan` den bestehenden, echten Plan
  // stillschweigend auf den Default zurücksetzen.
  const billingFields = isStripeConfigured()
    ? {}
    : { plan: normalizePlan(input.plan), billingCycle: normalizeBillingCycle(input.billingCycle) };

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
      ...billingFields,
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
  employeeNumberPrefix?: string;
  employeeNumberSuffix?: string;
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
      employeeNumberPrefix: optionalString(input.employeeNumberPrefix, 16) || "MA-",
      employeeNumberSuffix: optionalString(input.employeeNumberSuffix, 16),
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
      digestTime: normalizeDigestTime(input.digestTime),
    },
  });
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

/** Zeiterfassung (Stempeluhr) — siehe lib/time-tracking-service.ts. */
export async function updateTenantTimeTracking(input: {
  tenantSlug: string;
  enabled?: boolean;
  breaksEnabled?: boolean;
  autoBreakDeduction?: boolean;
  clockInMode?: string;
  clockInLeadMinutes?: string;
  reminderPush?: boolean;
  autoClockOut?: boolean;
  autoClockOutAfterShiftMinutes?: string;
  autoClockOutMaxHours?: string;
  qrRequired?: boolean;
  qrRequiredClockOut?: boolean;
}) {
  const access = await requireSettingsManager(input.tenantSlug);
  const actor = await requireTenantAccess(input.tenantSlug, "settings", "write");

  await ensureTenantSettings(access.tenantId);

  const updated = await prisma.tenantSettings.update({
    where: { tenantId: access.tenantId },
    data: {
      timeTrackingEnabled: normalizeBool(input.enabled),
      timeTrackingBreaksEnabled: normalizeBool(input.breaksEnabled),
      timeTrackingAutoBreakDeduction: normalizeBool(input.autoBreakDeduction),
      timeTrackingClockInMode: isClockInMode(input.clockInMode) ? input.clockInMode : "always",
      timeTrackingClockInLeadMinutes: clampInt(input.clockInLeadMinutes, 60, 0, 240),
      timeTrackingReminderPush: normalizeBool(input.reminderPush),
      timeTrackingAutoClockOut: normalizeBool(input.autoClockOut),
      timeTrackingAutoClockOutAfterShiftMinutes: clampInt(input.autoClockOutAfterShiftMinutes, 60, 0, 720),
      timeTrackingAutoClockOutMaxHours: clampInt(input.autoClockOutMaxHours, 12, 1, 24),
      timeTrackingQrRequired: normalizeBool(input.qrRequired),
      timeTrackingQrRequiredClockOut: normalizeBool(input.qrRequiredClockOut),
    },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: actor.userId,
    actorName: actor.userName,
    action: "Zeiterfassungs-Einstellungen geändert",
    source: "Einstellungen",
    entityType: "settings",
    entityId: access.tenantId,
    detail: `Aktiv: ${updated.timeTrackingEnabled ? "ja" : "nein"}, Pausen stempeln: ${
      updated.timeTrackingBreaksEnabled ? "ja" : "nein"
    }, Mindestpause abziehen: ${updated.timeTrackingAutoBreakDeduction ? "ja" : "nein"}, Einstempeln: ${
      updated.timeTrackingClockInMode
    } (${updated.timeTrackingClockInLeadMinutes} Min. vorher), QR-Scan in der App: Einstempeln ${
      updated.timeTrackingQrRequired ? "ja" : "nein"
    } / Ausstempeln ${updated.timeTrackingQrRequiredClockOut ? "ja" : "nein"}, Push: ${
      updated.timeTrackingReminderPush ? "ja" : "nein"
    }, Auto-Ausstempeln: ${
      updated.timeTrackingAutoClockOut
        ? `${updated.timeTrackingAutoClockOutAfterShiftMinutes} Min. nach Schichtende / ${updated.timeTrackingAutoClockOutMaxHours} h ohne Schicht`
        : "aus"
    }`,
  });

  return updated;
}

export async function updateTenantSecurity(input: {
  tenantSlug: string;
  twoFactorRequired?: boolean;
  sessionTimeout?: boolean;
  auditRetentionMonths?: string;
}) {
  const access = await requireSettingsManager(input.tenantSlug);

  // Session-Timeout ist noch nicht implementiert — die Session-Policy in
  // lib/auth.ts kennt keine mandantenspezifische Laufzeit. Statt den
  // Schalter stillschweigend zu speichern und eine nicht existierende
  // Durchsetzung vorzutäuschen, lehnen wir ihn explizit ab (Sicherheitsaudit
  // L04). twoFactorRequired wird dagegen tatsächlich durchgesetzt (siehe
  // lib/tenant-access.ts).
  if (input.sessionTimeout !== undefined) {
    throw new Error(
      "Ungültiger Wert: sessionTimeout wird derzeit nicht unterstützt und kann nicht gesetzt werden.",
    );
  }

  await ensureTenantSettings(access.tenantId);

  const updated = await prisma.tenantSettings.update({
    where: { tenantId: access.tenantId },
    data: {
      ...(input.twoFactorRequired === undefined
        ? {}
        : { twoFactorRequired: normalizeBool(input.twoFactorRequired) }),
      auditRetentionMonths: normalizeAuditRetentionMonths(input.auditRetentionMonths),
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
  const requestedRole = input.role === "ADMIN" || input.role === "HR" ? input.role : "EMPLOYEE";
  // "settings:write" allein darf niemanden mit mehr Macht einladen, als der
  // Einladende selbst hat — sonst könnte eine Custom-Rolle mit bloßem
  // settings:write sich über eine ADMIN/HR-Einladung selbst eskalieren
  // (Audit-Finding H02). Nur der tatsächliche Tenant-Owner/-Administrator
  // darf die mandantenweit privilegierten Legacy-Rollen vergeben.
  const role =
    requestedRole !== "EMPLOYEE" && access.role !== "OWNER" && access.role !== "ADMIN"
      ? "EMPLOYEE"
      : requestedRole;

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
      logger.error("Einladungs-E-Mail-Versand fehlgeschlagen.", {
        to: email,
        error: error instanceof Error ? error.message : String(error),
      });
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
