import "server-only";

import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revokeProviderToken } from "@/lib/oauth-revocation";
import { sendAccountDeletionRequestEmail } from "@/lib/email";
import {
  assertNoOrphanedTenantOwnership,
  unlinkAndCleanupBeforeUserDeletion,
} from "@/lib/user-deletion-lifecycle";
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
 * Löscht sofort und vollständig den Konto-Zugang (Login) eines Nutzers:
 * widerruft zuerst dessen Social-Login-Tokens beim Provider (best-effort,
 * s. lib/oauth-revocation.ts), löscht dann den `User`-Datensatz — Sitzungen,
 * Zugangsdaten/Social-Login-Verknüpfungen (`Account`) und Push-Token
 * kaskadieren dabei per Schema (`onDelete: Cascade`). Verknüpfte
 * `TenantEmployee`-Personalakten (Stammdaten) werden NICHT gelöscht, nur
 * von der gelöschten `userId` abgehängt — sie haben keine harte
 * DB-Relation zu `User` und würden sonst auf eine nicht mehr existierende
 * ID verweisen. `ConsentRecord` (Cookie-Consent-Nachweis) hat aus demselben
 * Grund ebenfalls keine harte FK/Kaskade zu `User` — wird deshalb hier
 * ausdrücklich mitgelöscht, sonst bliebe die IP-/User-Agent-Historie
 * verwaist bestehen (Audit-Finding M05).
 *
 * Bewusst ein hartes Löschen statt nur Zugangsdaten/Sitzungen zu entfernen:
 * better-auths Passwort-Reset-Flow legt für einen weiterhin existierenden
 * Nutzer ohne Credential-Account automatisch einen neuen an (s.
 * node_modules/better-auth/dist/api/routes/password.mjs resetPassword) —
 * ein bloßes Entfernen der Zugangsdaten würde die erneute Anmeldung also
 * NICHT zuverlässig verhindern.
 */
export async function deleteUserAccessImmediately(userId: string) {
  await assertNoOrphanedTenantOwnership(userId);

  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { providerId: true, accessToken: true, refreshToken: true },
  });

  await Promise.allSettled(accounts.map((account) => revokeProviderToken(account)));
  await unlinkAndCleanupBeforeUserDeletion(userId);
  await prisma.user.delete({ where: { id: userId } });
}

/**
 * Self-Service-Variante von `deleteUserAccessImmediately` für das eigene,
 * eingeloggte Konto — ohne Karenzzeit (anders als
 * `scheduleOwnAccountDeletion`). Für die eigene Personalakte (Stammdaten)
 * ändert sich nichts, sie bleibt beim Arbeitgeber erhalten.
 */
export async function deleteOwnAccountAccess() {
  const session = await requireSession();

  await deleteUserAccessImmediately(session.user.id);
}

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

  await assertNoOrphanedTenantOwnership(session.user.id);

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

const ACCOUNT_DELETION_REQUEST_TTL_MINUTES = 15;
const ACCOUNT_DELETION_VERIFICATION_PREFIX = "account-deletion-request:";

function getAppBaseUrl() {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/**
 * Oeffentlicher, login-loser Ablauf fuer die Kontoloeschung (Google-Play-
 * Vorgabe: ein funktionierender Link ausserhalb der App). Nennt bewusst
 * nicht, ob zur E-Mail ein Konto existiert - verhindert, dass sich die
 * Seite zum Durchprobieren registrierter Adressen eignet. Die eigentliche
 * Loeschung passiert erst nach explizitem Klick auf der Bestaetigungsseite
 * (confirmAccountDeletionByToken), damit ein E-Mail-Sicherheitsscanner, der
 * Links vorab abruft, nicht versehentlich Konten loescht.
 */
export async function requestAccountDeletionByEmail(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    throw new Error("Bitte eine gueltige E-Mail-Adresse angeben.");
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true },
  });

  if (!user) {
    return;
  }

  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

  await prisma.verification.create({
    data: {
      identifier: ACCOUNT_DELETION_VERIFICATION_PREFIX + token,
      value: user.id,
      expiresAt: new Date(Date.now() + ACCOUNT_DELETION_REQUEST_TTL_MINUTES * 60 * 1000),
    },
  });

  const url = `${getAppBaseUrl()}/konto-loeschung/bestaetigen?token=${token}`;

  await sendAccountDeletionRequestEmail({ to: user.email, url });
}

/** Liest vor, ob ein Bestaetigungs-Token (noch) gueltig ist, ohne ihn zu verbrauchen. */
export async function peekAccountDeletionToken(token: string) {
  const record = await prisma.verification.findFirst({
    where: {
      identifier: ACCOUNT_DELETION_VERIFICATION_PREFIX + token,
      expiresAt: { gt: new Date() },
    },
  });

  return Boolean(record);
}

/**
 * Vollzieht die per E-Mail angeforderte Kontoloeschung: prueft den Token
 * (15 Minuten gueltig, Einmalgebrauch), loescht dann sofort und vollstaendig
 * ueber deleteUserAccessImmediately - Zugangsdaten, Sitzungen,
 * Social-Login-Verknuepfungen und Push-Token fallen dabei per Kaskade weg.
 */
export async function confirmAccountDeletionByToken(token: string) {
  const identifier = ACCOUNT_DELETION_VERIFICATION_PREFIX + token;

  const record = await prisma.verification.findFirst({
    where: { identifier, expiresAt: { gt: new Date() } },
  });

  if (!record) {
    throw new Error(
      "Dieser Link ist ungueltig oder abgelaufen. Bitte die Loeschung erneut anfordern.",
    );
  }

  await prisma.verification.delete({ where: { id: record.id } }).catch(() => {});

  await deleteUserAccessImmediately(record.value);
}
