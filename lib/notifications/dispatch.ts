import "server-only";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured, sendEmail } from "@/lib/email";

export type NotificationEvent = {
  userId: string;
  email: string | null;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Zentrale Zustellung für Benachrichtigungen, kanalunabhängig.
 *
 * Aktiv: E-Mail (über lib/email.ts). Vorbereitet: Push — die Tabelle
 * `PushSubscription` sammelt bereits Geräte-Tokens, sobald eine mobile App
 * existiert und sich registriert. Der Push-Kanal ist bewusst ein No-Op, bis
 * ein echter Provider (FCM/APNs) angebunden ist; neue Aufrufer müssen dafür
 * nichts ändern — `dispatchNotification` bleibt der einzige Call-Point.
 */
interface NotificationChannel {
  name: string;
  isEnabledFor(event: NotificationEvent): Promise<boolean>;
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
  async isEnabledFor(event) {
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

const channels: NotificationChannel[] = [emailChannel, pushChannel];

export async function dispatchNotification(event: NotificationEvent) {
  for (const channel of channels) {
    if (await channel.isEnabledFor(event)) {
      await channel.send(event);
    }
  }
}
