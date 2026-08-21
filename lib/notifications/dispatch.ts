import "server-only";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured, sendEmail } from "@/lib/email";

export type NotificationCategory = "vacation" | "shift" | "system";

export type NotificationEvent = {
  userId: string;
  email: string | null;
  subject: string;
  text: string;
  html?: string;
  /**
   * Mandant + Kategorie sind Pflicht für den In-App-Kanal (Zeile in
   * `TenantEmployeeNotification`) und steuern zusätzlich die persönliche
   * Opt-out-Ebene (`UserPreference.notifyVacationEvents`/`notifyShiftEvents`,
   * s. u.). `category: "system"` kann nicht abbestellt werden.
   */
  tenantId: string;
  category: NotificationCategory;
  /** Optionale Referenz fürs Deep-Linking (z. B. "info-request" + die jeweilige ID). */
  entityType?: string;
  entityId?: string;
};

/**
 * Zentrale Zustellung für Benachrichtigungen, kanalunabhängig.
 *
 * Aktiv: E-Mail (über lib/email.ts), In-App (TenantEmployeeNotification —
 * von der Mitarbeiter-App gelesen). Vorbereitet: Push — die Tabelle
 * `PushSubscription` sammelt bereits Geräte-Tokens, sobald eine mobile App
 * existiert und sich registriert. Der Push-Kanal ist bewusst ein No-Op, bis
 * ein echter Provider (FCM/APNs) angebunden ist; neue Aufrufer müssen dafür
 * nichts ändern — `dispatchNotification` bleibt der einzige Call-Point.
 */
type UserNotificationPreference = {
  notifyVacationEvents: boolean;
  notifyShiftEvents: boolean;
  pushEnabled: boolean;
} | null;

interface NotificationChannel {
  name: string;
  isEnabledFor(event: NotificationEvent, preference: UserNotificationPreference): Promise<boolean>;
  send(event: NotificationEvent): Promise<void>;
}

const emailChannel: NotificationChannel = {
  name: "email",
  async isEnabledFor(event) {
    return isEmailConfigured() && Boolean(event.email);
  },
  async send(event) {
    if (!event.email) return;

    await sendEmail({
      to: event.email,
      subject: event.subject,
      text: event.text,
      html: event.html,
    });
  },
};

const pushChannel: NotificationChannel = {
  name: "push",
  async isEnabledFor(event, preference) {
    if (!(preference?.pushEnabled ?? true)) {
      return false;
    }

    const subscription = await prisma.pushSubscription.findFirst({
      where: { userId: event.userId },
      select: { id: true },
    });

    return Boolean(subscription);
  },
  async send() {
    // Kein Provider angebunden — sobald FCM/APNs verdrahtet ist, hier den
    // Push an alle PushSubscription-Tokens des Nutzers verschicken.
  },
};

const inAppChannel: NotificationChannel = {
  name: "in-app",
  async isEnabledFor() {
    return true;
  },
  async send(event) {
    await prisma.tenantEmployeeNotification.create({
      data: {
        tenantId: event.tenantId,
        userId: event.userId,
        category: event.category,
        title: event.subject,
        detail: event.text,
        entityType: event.entityType ?? "",
        entityId: event.entityId ?? "",
      },
    });
  },
};

const channels: NotificationChannel[] = [emailChannel, pushChannel, inAppChannel];

/** Persönliche Opt-out-Ebene: "system"-Kategorie kann nicht abbestellt werden. */
function isCategoryEnabledForUser(category: NotificationCategory, preference: UserNotificationPreference) {
  if (category === "vacation") {
    return preference?.notifyVacationEvents ?? true;
  }

  if (category === "shift") {
    return preference?.notifyShiftEvents ?? true;
  }

  return true;
}

export async function dispatchNotification(event: NotificationEvent) {
  const preference = await prisma.userPreference.findUnique({
    where: { userId: event.userId },
    select: { notifyVacationEvents: true, notifyShiftEvents: true, pushEnabled: true },
  });

  if (!isCategoryEnabledForUser(event.category, preference)) {
    return;
  }

  for (const channel of channels) {
    if (await channel.isEnabledFor(event, preference)) {
      await channel.send(event);
    }
  }
}
