import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordTenantAudit } from "@/lib/audit";
import { upsertTenantSystemRoleByKey } from "@/lib/role-service";
import { requireTenantAccess } from "@/lib/tenant-access";
import { headers } from "next/headers";

export type InvitationView = {
  id: string;
  email: string;
  role: string;
  status: string;
  tenantName: string;
  tenantSlug: string;
  expired: boolean;
};

function isExpired(expiresAt: Date | null) {
  return Boolean(expiresAt && expiresAt.getTime() < Date.now());
}

export async function getInvitationByToken(
  token: string,
): Promise<InvitationView | null> {
  if (!token) {
    return null;
  }

  const invitation = await prisma.tenantInvitation.findUnique({
    where: { token },
    include: { tenant: { select: { name: true, slug: true } } },
  });

  if (!invitation) {
    return null;
  }

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    tenantName: invitation.tenant.name,
    tenantSlug: invitation.tenant.slug,
    expired: isExpired(invitation.expiresAt),
  };
}

export type InvitationStatusView = {
  status: string;
  expired: boolean;
};

export async function getInvitationStatusForEmail(
  tenantSlug: string,
  email: string,
): Promise<InvitationStatusView | null> {
  const normalized = email.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const { tenantId } = await requireTenantAccess(tenantSlug, "employees", "read");

  const invitation = await prisma.tenantInvitation.findUnique({
    where: { tenantId_email: { tenantId, email: normalized } },
    select: { status: true, expiresAt: true },
  });

  if (!invitation) {
    return null;
  }

  return {
    status: invitation.status,
    expired: isExpired(invitation.expiresAt),
  };
}

export async function hasAccountForEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  const user = await prisma.user.findFirst({
    where: { email: normalized },
    select: { id: true },
  });

  return Boolean(user);
}

export type AcceptInvitationResult =
  | { ok: true; tenantSlug: string }
  | {
      ok: false;
      reason:
        | "NOT_FOUND"
        | "NOT_LOGGED_IN"
        | "EMAIL_MISMATCH"
        | "EXPIRED"
        | "ALREADY_ACCEPTED";
    };

export async function acceptInvitation(
  token: string,
): Promise<AcceptInvitationResult> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return { ok: false, reason: "NOT_LOGGED_IN" };
  }

  return acceptInvitationForUser(token, {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
  });
}

/**
 * Legt (falls nötig) die System-Rolle zur eingeladenen Legacy-Rolle an und
 * liefert deren id. Ohne roleRef hätte die Membership in requireTenantAccess
 * für jeden Bereich "none" und liefe überall auf FORBIDDEN.
 * Bewusst ohne requireTenantAccess: Der Annehmende ist noch kein Mitglied –
 * seine Autorisierung ist der Einladungs-Token selbst.
 *
 * Delegiert an `upsertTenantSystemRoleByKey`, damit hier exakt dasselbe
 * vollständige Rollen-Template (inkl. scope/Fähigkeiten) verwendet wird wie
 * bei der regulären Tenant-Initialisierung — siehe Audit-Finding C01.
 */
async function ensureSystemRoleForInvitation(
  tenantId: string,
  invitationRole: string,
) {
  if (invitationRole !== "EMPLOYEE") {
    // ADMIN/HR sind über die Legacy-Rolle bereits Tenant-Manager.
    return null;
  }

  return upsertTenantSystemRoleByKey(tenantId, "employee");
}

/**
 * Nimmt die Einladung für einen bereits verifizierten Benutzer an, ohne die
 * Session aus den Request-Headern zu lesen. Wird vom Invite-Flow genutzt,
 * wenn Login/Registrierung und Annahme in derselben Server Action passieren
 * (die frische Session-Cookie steht dort noch nicht in den Request-Headern).
 */
export async function acceptInvitationForUser(
  token: string,
  user: { id: string; email: string; name?: string },
): Promise<AcceptInvitationResult> {
  const invitation = await prisma.tenantInvitation.findUnique({
    where: { token },
    include: { tenant: { select: { id: true, slug: true, name: true } } },
  });

  if (!invitation) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  if (invitation.status !== "PENDING") {
    return { ok: false, reason: "ALREADY_ACCEPTED" };
  }

  if (isExpired(invitation.expiresAt)) {
    return { ok: false, reason: "EXPIRED" };
  }

  const userEmail = user.email.trim().toLowerCase();

  if (userEmail !== invitation.email.trim().toLowerCase()) {
    return { ok: false, reason: "EMAIL_MISMATCH" };
  }

  const roleId = await ensureSystemRoleForInvitation(
    invitation.tenantId,
    invitation.role,
  );

  await prisma.$transaction(async (tx) => {
    await tx.tenantMembership.upsert({
      where: {
        tenantId_userId: {
          tenantId: invitation.tenantId,
          userId: user.id,
        },
      },
      create: {
        tenantId: invitation.tenantId,
        userId: user.id,
        role: invitation.role,
        roleId,
      },
      update: roleId ? { role: invitation.role, roleId } : {},
    });

    await tx.tenantInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    // Vorhandene Mitarbeiterakte mit gleicher E-Mail dem Konto zuordnen,
    // damit Self-Service-Funktionen später den richtigen Datensatz finden.
    await tx.tenantEmployee.updateMany({
      where: {
        tenantId: invitation.tenantId,
        userId: null,
        email: invitation.email,
      },
      data: { userId: user.id },
    });
  });

  await recordTenantAudit({
    tenantId: invitation.tenantId,
    actorId: user.id,
    actorName: user.name || user.email,
    action: "Einladung angenommen",
    source: "Einladung",
    entityType: "invitation",
    entityId: invitation.id,
    detail: invitation.email,
  });

  return { ok: true, tenantSlug: invitation.tenant.slug };
}

export function buildInvitationUrl(token: string) {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  return `${baseUrl.replace(/\/$/, "")}/invite/${token}`;
}
