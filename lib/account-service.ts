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
    twoFactorEnabled: session.user.twoFactorEnabled ?? false,
    image: session.user.image ?? null,
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

export const ACCOUNT_DELETION_GRACE_DAYS = 30;

/**
 * Merkt das eigene Konto zur Löschung vor, statt sofort hart zu löschen.
 * Mandanten, in denen der Nutzer alleiniger Inhaber ist, würden verwaisen –
 * das wird vorher geprüft. Nach dem Vormerken werden alle Sitzungen
 * beendet (wirkt wie eine Löschung); meldet sich der Nutzer innerhalb von
 * `ACCOUNT_DELETION_GRACE_DAYS` Tagen erneut an, kann er die Löschung noch
 * abbrechen. Der Cron-Job (`/api/cron/cleanup`) löscht danach endgültig.
 */
export async function scheduleOwnAccountDeletion(password: string) {
  const session = await requireSession();

  const ownerships = await prisma.tenantMembership.findMany({
    where: { userId: session.user.id, role: "OWNER" },
    select: { tenantId: true, tenant: { select: { name: true } } },
  });

  for (const ownership of ownerships) {
    const otherOwners = await prisma.tenantMembership.count({
      where: {
        tenantId: ownership.tenantId,
        userId: { not: session.user.id },
        role: "OWNER",
      },
    });

    if (otherOwners === 0) {
      throw new Error(
        `Sie sind alleinige/r Inhaber/in von „${ownership.tenant.name}“. Bitte zuerst eine andere Person als Inhaber/in eintragen oder den Mandanten löschen.`,
      );
    }
  }

  try {
    await auth.api.signInEmail({
      body: { email: session.user.email, password },
    });
  } catch {
    throw new Error(
      "Konto konnte nicht zur Löschung vorgemerkt werden. Bitte das Passwort prüfen.",
    );
  }

  const scheduledDeletionAt = new Date(
    Date.now() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.user.update({
    where: { id: session.user.id },
    data: { scheduledDeletionAt },
  });

  await auth.api.revokeSessions({ headers: await headers() });

  return scheduledDeletionAt;
}

/** Liest vor, ob das aktuell eingeloggte Konto zur Löschung vorgemerkt ist. */
export async function getOwnScheduledDeletion() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { scheduledDeletionAt: true },
  });

  return user?.scheduledDeletionAt ?? null;
}

/** Bricht eine vorgemerkte Löschung ab (Login innerhalb der Schutzfrist). */
export async function cancelOwnAccountDeletion() {
  const session = await requireSession();

  await prisma.user.update({
    where: { id: session.user.id },
    data: { scheduledDeletionAt: null },
  });
}

export const startPages = [
  "overview",
  "mein-bereich",
  "employees",
  "urlaub",
  "schichtplanung",
] as const;
export type StartPage = (typeof startPages)[number];

// Muss mit den <option>-Werten in app/(dashboard)/konto/page.tsx übereinstimmen.
export const preferenceLanguages = ["de", "en"] as const;
export const preferenceTimezones = [
  "Europe/Berlin",
  "Europe/London",
  "Europe/Vienna",
  "Europe/Zurich",
] as const;
export const preferenceDateFormats = ["dd.mm.yyyy", "yyyy-mm-dd", "mm/dd/yyyy"] as const;

export const defaultUserPreference = {
  language: "de",
  timezone: "Europe/Berlin",
  startPage: "overview" as StartPage,
  dateFormat: "dd.mm.yyyy",
  notifyVacationEvents: true,
  notifyShiftEvents: true,
  pushEnabled: true,
};

export async function getOwnPreferences() {
  const session = await requireSession();
  const preference = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
  });

  if (!preference) {
    return defaultUserPreference;
  }

  return {
    language: preference.language,
    timezone: preference.timezone,
    startPage: (startPages.includes(preference.startPage as StartPage)
      ? preference.startPage
      : "overview") as StartPage,
    dateFormat: preference.dateFormat,
    notifyVacationEvents: preference.notifyVacationEvents,
    notifyShiftEvents: preference.notifyShiftEvents,
    pushEnabled: preference.pushEnabled,
  };
}

export async function updateOwnPreferences(input: {
  language: string;
  timezone: string;
  startPage: string;
  dateFormat: string;
  notifyVacationEvents?: boolean;
  notifyShiftEvents?: boolean;
  pushEnabled?: boolean;
}) {
  const session = await requireSession();
  const startPage = startPages.includes(input.startPage as StartPage)
    ? input.startPage
    : "overview";
  const language = preferenceLanguages.includes(
    input.language.trim() as (typeof preferenceLanguages)[number],
  )
    ? input.language.trim()
    : "de";
  const timezone = preferenceTimezones.includes(
    input.timezone.trim() as (typeof preferenceTimezones)[number],
  )
    ? input.timezone.trim()
    : "Europe/Berlin";
  const dateFormat = preferenceDateFormats.includes(
    input.dateFormat.trim() as (typeof preferenceDateFormats)[number],
  )
    ? input.dateFormat.trim()
    : "dd.mm.yyyy";

  // notify*/pushEnabled sind optional, damit Aufrufer wie switchLanguageAction
  // (ändert nur die Sprache) sie nicht mitschicken müssen — ohne diesen
  // Fallback auf den GESPEICHERTEN Wert (statt hart auf true) würde jede
  // Sprach-/Zeitzonenänderung im Web-Dashboard eine über die Mobile-App
  // gesetzte Abbestellung stillschweigend wieder aktivieren.
  const existing = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
    select: { notifyVacationEvents: true, notifyShiftEvents: true, pushEnabled: true },
  });
  const notifyVacationEvents = input.notifyVacationEvents ?? existing?.notifyVacationEvents ?? true;
  const notifyShiftEvents = input.notifyShiftEvents ?? existing?.notifyShiftEvents ?? true;
  const pushEnabled = input.pushEnabled ?? existing?.pushEnabled ?? true;

  await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      language,
      timezone,
      startPage,
      dateFormat,
      notifyVacationEvents,
      notifyShiftEvents,
      pushEnabled,
    },
    update: {
      language,
      timezone,
      startPage,
      dateFormat,
      notifyVacationEvents,
      notifyShiftEvents,
      pushEnabled,
    },
  });
}

/** Für den Post-Login-Redirect: welchen Pfad die Startseiten-Präferenz innerhalb eines Mandanten ergibt. */
export function startPagePath(tenantSlug: string, startPage: StartPage) {
  switch (startPage) {
    case "mein-bereich":
      return `/u/${tenantSlug}/mein-bereich`;
    case "employees":
      return `/u/${tenantSlug}/employees`;
    case "urlaub":
      return `/u/${tenantSlug}/urlaub`;
    case "schichtplanung":
      return `/u/${tenantSlug}/schichtplanung`;
    case "overview":
    default:
      return `/u/${tenantSlug}`;
  }
}
