import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    throw new Error("Nicht angemeldet.");
  }

  return session;
}

export async function getAccountOverview() {
  const session = await requireSession();
  const [memberships, sessionCount] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { userId: session.user.id },
      select: {
        role: true,
        tenant: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.session.count({ where: { userId: session.user.id } }),
  ]);

  return {
    name: session.user.name || session.user.email,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    memberships,
    sessionCount,
  };
}

export async function updateAccountName(name: string) {
  const session = await requireSession();
  const trimmed = name.trim();

  if (trimmed.length < 2) {
    throw new Error("Bitte einen Namen mit mindestens zwei Zeichen angeben.");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name: trimmed.slice(0, 120) },
  });
}

export async function changeAccountPassword(input: {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions: boolean;
}) {
  await requireSession();

  if (input.newPassword.length < 12) {
    throw new Error("Das neue Passwort muss mindestens 12 Zeichen lang sein.");
  }

  try {
    await auth.api.changePassword({
      headers: await headers(),
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: input.revokeOtherSessions,
      },
    });
  } catch {
    // Die Fehlermeldung von better-auth verrät sonst, ob das Konto existiert.
    throw new Error(
      "Passwort konnte nicht geändert werden. Bitte das aktuelle Passwort prüfen.",
    );
  }
}

/**
 * Löscht das eigene Konto. Mandanten, in denen der Nutzer alleiniger
 * Inhaber ist, würden verwaisen – das wird vorher geprüft.
 */
export async function deleteOwnAccount(password: string) {
  const session = await requireSession();

  const ownerships = await prisma.tenantMembership.findMany({
    where: { userId: session.user.id, role: { in: ["OWNER", "owner"] } },
    select: { tenantId: true, tenant: { select: { name: true } } },
  });

  for (const ownership of ownerships) {
    const otherOwners = await prisma.tenantMembership.count({
      where: {
        tenantId: ownership.tenantId,
        userId: { not: session.user.id },
        role: { in: ["OWNER", "owner"] },
      },
    });

    if (otherOwners === 0) {
      throw new Error(
        `Sie sind alleinige/r Inhaber/in von „${ownership.tenant.name}“. Bitte zuerst eine andere Person als Inhaber/in eintragen oder den Mandanten löschen.`,
      );
    }
  }

  try {
    await auth.api.deleteUser({
      headers: await headers(),
      body: { password },
    });
  } catch {
    throw new Error(
      "Konto konnte nicht gelöscht werden. Bitte das Passwort prüfen.",
    );
  }
}
