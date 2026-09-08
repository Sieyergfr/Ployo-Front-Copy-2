import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import {
  isExpoPushToken,
  sendExpoPushMessages,
  toPushBody,
} from "@/lib/notifications/expo-push";
import {
  renderNotification,
  toNotificationLocale,
  type NotificationLocale,
  type NotificationMessage,
} from "@/lib/notifications/messages";

export type NotificationCategory = "vacation" | "shift" | "system";

/**
 * Was tatsächlich verschickt wird: der Aufrufer liefert einen
 * sprachneutralen `NotificationMessage`, gerendert wird pro Empfänger in
 * dessen Sprache (`UserPreference.language`) — siehe
 * lib/notifications/messages.ts.
 */
type ResolvedNotificationEvent = NotificationEvent & {
  subject: string;
  text: string;
  html?: string;
  /** Sprache des Empfängers — der In-App-Kanal rendert damit seine kompakte Variante. */
  locale: NotificationLocale;
};

export type NotificationEvent = {
  userId: string;
  email: string | null;
  message: NotificationMessage;
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
 * von der Mitarbeiter-App gelesen) und Push über den Expo Push Service
 * (lib/notifications/expo-push.ts) an die Geräte-Tokens aus
 * `PushSubscription`. `dispatchNotification` bleibt der einzige Call-Point;
 * neue Aufrufer müssen sich um die Kanäle nicht kümmern.
 */
type UserNotificationPreference = {
  notifyVacationEvents: boolean;
  notifyShiftEvents: boolean;
  pushEnabled: boolean;
  language: string;
} | null;

/**
 * Kanal-Schalter je Mandant (`TenantSettings.mailNotifications`/`mobilePush`/
 * `inAppNotifications`) — jeder Schalter gilt nur für seinen eigenen Kanal.
 * Vorher prüfte nur `mailNotifications`, und zwar als Vorfilter VOR
 * `dispatchNotification` für ALLE Kanäle zugleich (Audit-Finding M11); ein
 * deaktiviertes `mobilePush`/`inAppNotifications` wurde nirgends geprüft.
 */
type TenantChannelSettings = {
  mailNotifications: boolean;
  mobilePush: boolean;
  inAppNotifications: boolean;
};

interface NotificationChannel {
  name: string;
  isEnabledFor(
    event: ResolvedNotificationEvent,
    preference: UserNotificationPreference,
    tenantSettings: TenantChannelSettings,
  ): Promise<boolean>;
  send(event: ResolvedNotificationEvent): Promise<void>;
}

const emailChannel: NotificationChannel = {
  name: "email",
  async isEnabledFor(event, _preference, tenantSettings) {
    return tenantSettings.mailNotifications && isEmailConfigured() && Boolean(event.email);
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
  async isEnabledFor(event, preference, tenantSettings) {
    if (!tenantSettings.mobilePush || !(preference?.pushEnabled ?? true)) {
      return false;
    }

    const subscription = await prisma.pushSubscription.findFirst({
      where: { userId: event.userId },
      select: { id: true },
    });

    return Boolean(subscription);
  },
  async send(event) {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: event.userId },
      select: { token: true },
    });

    const tokens = subscriptions.map((subscription) => subscription.token).filter(isExpoPushToken);

    if (tokens.length === 0) return;

    // Deep-Link-Referenz mitschicken: die App öffnet damit denselben Screen,
    // den auch die Zeile im In-App-Posteingang ansteuert (src/lib/push.ts).
    const data: Record<string, string> = {
      tenantId: event.tenantId,
      category: event.category,
    };

    if (event.entityType) data.entityType = event.entityType;
    if (event.entityId) data.entityId = event.entityId;

    const results = await sendExpoPushMessages(
      tokens.map((token) => ({
        to: token,
        title: event.subject,
        body: toPushBody(event.text),
        sound: "default" as const,
        // Muss zum Kanal passen, den die App beim Start anlegt.
        channelId: "default",
        data,
      })),
    );

    // Deinstalliert oder abgemeldet: Expo meldet den Token als tot. Sofort
    // austragen, sonst sammelt die Tabelle Tokens, die nie wieder etwas
    // empfangen, und jeder Versand schleppt sie mit.
    const staleTokens = results
      .filter((result) => result.error === "DeviceNotRegistered")
      .map((result) => result.token);

    if (staleTokens.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: { userId: event.userId, token: { in: staleTokens } },
      });
    }
  },
};

const inAppChannel: NotificationChannel = {
  name: "in-app",
  async isEnabledFor(_event, _preference, tenantSettings) {
    return tenantSettings.inAppNotifications;
  },
  async send(event) {
    // `messagePayload` ist die eigentliche Quelle: title/detail sind in der
    // Sprache gerendert, die der Empfänger beim Versand eingestellt hatte —
    // wechselt er sie später, soll der Posteingang mitziehen. Sie bleiben
    // trotzdem stehen, damit ältere Clients (und Zeilen ohne Payload) etwas
    // anzuzeigen haben.
    const rendered = renderNotification(event.message, event.locale, { compact: true });

    await prisma.tenantEmployeeNotification.create({
      data: {
        tenantId: event.tenantId,
        userId: event.userId,
        category: event.category,
        title: rendered.subject,
        detail: rendered.text,
        entityType: event.entityType ?? "",
        entityId: event.entityId ?? "",
        messagePayload: event.message,
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
  const [preference, settings] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId: event.userId },
      select: {
        notifyVacationEvents: true,
        notifyShiftEvents: true,
        pushEnabled: true,
        language: true,
      },
    }),
    prisma.tenantSettings.findUnique({
      where: { tenantId: event.tenantId },
      select: { mailNotifications: true, mobilePush: true, inAppNotifications: true },
    }),
  ]);
  const tenantSettings: TenantChannelSettings = {
    mailNotifications: settings?.mailNotifications ?? true,
    mobilePush: settings?.mobilePush ?? false,
    inAppNotifications: settings?.inAppNotifications ?? true,
  };

  if (!isCategoryEnabledForUser(event.category, preference)) {
    return;
  }

  // Sprache des EMPFAENGERS, nicht die des Requests: derselbe Vorgang kann
  // Empfaenger mit unterschiedlichen Spracheinstellungen haben.
  const locale = toNotificationLocale(preference?.language);
  const rendered = renderNotification(event.message, locale);
  const resolved: ResolvedNotificationEvent = { ...event, ...rendered, locale };

  for (const channel of channels) {
    try {
      if (await channel.isEnabledFor(resolved, preference, tenantSettings)) {
        await channel.send(resolved);
      }
    } catch (error) {
      // Ein Kanal (typischerweise E-Mail, abhängig vom externen SMTP-Server)
      // darf weder die übrigen Kanäle noch den aufrufenden Request-Handler
      // zum Scheitern bringen — die eigentliche Aktion (z. B. das Anlegen
      // der Wunschfrei-Anfrage) ist zu diesem Zeitpunkt bereits committed.
      logger.error(`Benachrichtigung über Kanal "${channel.name}" fehlgeschlagen`, {
        channel: channel.name,
        userId: event.userId,
        category: event.category,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
