import "server-only";
import { recordTenantAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  notifyAdminsOfAccessRequest,
  notifyManagersOfDeclinedInvitation,
  notifyOwnersOfSubscriptionReminder,
} from "@/lib/notifications/events";
import { prisma } from "@/lib/prisma";
import { requireTenantMembership } from "@/lib/tenant-access";
import { headers } from "next/headers";

/**
 * Anfragen von Personen ohne die nötigen Rechte: Zugriff anfragen,
 * Inhaber:in an das Abo erinnern, Einladung ablehnen. Keine Migration:
 * Nachweis und Drosselung laufen über das Audit-Log, die Zustellung über
 * die bestehende Benachrichtigungsschiene (Posteingang, Push, E-Mail).
 */

export const SELF_SERVICE_REQUEST_MESSAGES = [
  "Bereits angefragt. Sie können es in 24 Stunden erneut versuchen.",
  "Einladung nicht gefunden oder nicht mehr offen.",
  "Bitte melden Sie sich an.",
] as const;

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const ACCESS_REQUEST_ACTION = "Zugriff angefragt";
export const SUBSCRIPTION_REMINDER_ACTION = "Abo-Erinnerung angefragt";
export const INVITATION_DECLINED_ACTION = "Einladung abgelehnt";

async function assertCooldown(tenantId: string, actorId: string, action: string) {
  const recent = await prisma.tenantAuditLog.findFirst({
    where: { tenantId, actorId, action, createdAt: { gt: new Date(Date.now() - COOLDOWN_MS) } },
    select: { id: true },
  });

  if (recent) {
    throw new Error(SELF_SERVICE_REQUEST_MESSAGES[0]);
  }
}

/** Nur Pfade innerhalb des Mandanten, ohne Query — landet als Text in der Benachrichtigung. */
function cleanPath(tenantSlug: string, path: string) {
  const prefix = `/u/${tenantSlug}`;
  const withoutQuery = path.split(/[?#]/)[0] ?? "";

  if (!withoutQuery.startsWith(prefix)) return "";

  const rest = withoutQuery.slice(prefix.length) || "/";

  return /^[\w\-/äöüÄÖÜß]{1,120}$/.test(rest) && !rest.startsWith("/kein-zugriff") ? rest : "";
}

export async function requestTenantAccess(input: { tenantSlug: string; path?: string }) {
  const access = await requireTenantMembership(input.tenantSlug);
  const [tenant, user] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: access.tenantId }, select: { name: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: access.userId }, select: { email: true } }),
  ]);

  await assertCooldown(access.tenantId, access.userId, ACCESS_REQUEST_ACTION);

  const path = cleanPath(input.tenantSlug, input.path ?? "");

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: ACCESS_REQUEST_ACTION,
    source: "Web",
    entityType: "user",
    entityId: access.userId,
    detail: path,
  });

  return notifyAdminsOfAccessRequest({
    tenantId: access.tenantId,
    tenantName: tenant.name,
    requesterUserId: access.userId,
    requesterName: access.userName,
    requesterEmail: user.email,
    path,
  });
}

/**
 * Bewusst ohne requireTenantMembership: der Mandant ist gesperrt, die
 * Abo-Prüfung dort würde genau diese Anfrage verhindern. Geprüft wird nur
 * die Mitgliedschaft.
 */
export async function requestSubscriptionReminder(tenantSlug: string) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    throw new Error(SELF_SERVICE_REQUEST_MESSAGES[2]);
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: { userId: session.user.id, tenant: { slug: tenantSlug } },
    select: { tenant: { select: { id: true, name: true } } },
  });

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  const actorName = session.user.name || session.user.email;

  await assertCooldown(membership.tenant.id, session.user.id, SUBSCRIPTION_REMINDER_ACTION);
  await recordTenantAudit({
    tenantId: membership.tenant.id,
    actorId: session.user.id,
    actorName,
    action: SUBSCRIPTION_REMINDER_ACTION,
    source: "Web",
    entityType: "tenant",
    entityId: membership.tenant.id,
  });

  return notifyOwnersOfSubscriptionReminder({
    tenantId: membership.tenant.id,
    tenantName: membership.tenant.name,
    requesterUserId: session.user.id,
    requesterName: actorName,
  });
}

/**
 * Einladung ablehnen: wer den Link hat (Einladungsseite) oder angemeldet ist
 * und dieselbe E-Mail hat (Unternehmensauswahl). Statt eines neuen Status
 * (Migration, App liest den Status mit) gilt die Einladung danach als
 * abgelaufen — die Verwaltung kann jederzeit neu einladen.
 */
export async function declineInvitationByToken(token: string) {
  const invitation = await prisma.tenantInvitation.findUnique({
    where: { token },
    select: { id: true, email: true, status: true, expiresAt: true, tenantId: true, tenant: { select: { name: true } } },
  });

  if (!invitation || invitation.status !== "PENDING" || (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now())) {
    throw new Error(SELF_SERVICE_REQUEST_MESSAGES[1]);
  }

  const session = await auth.api.getSession({ headers: await headers() });

  await prisma.tenantInvitation.update({
    where: { id: invitation.id },
    data: { status: "EXPIRED", expiresAt: new Date() },
  });
  await recordTenantAudit({
    tenantId: invitation.tenantId,
    actorId: session?.user?.id ?? "",
    actorName: session?.user?.name || invitation.email,
    action: INVITATION_DECLINED_ACTION,
    source: "Web",
    entityType: "invitation",
    entityId: invitation.id,
    detail: invitation.email,
  });
  await notifyManagersOfDeclinedInvitation({
    tenantId: invitation.tenantId,
    tenantName: invitation.tenant.name,
    email: invitation.email,
    invitationId: invitation.id,
  });
}
