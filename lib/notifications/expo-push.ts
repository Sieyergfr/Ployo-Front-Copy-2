import "server-only";
import { logger } from "@/lib/logger";

/**
 * Versand über den Expo Push Service. Expo nimmt uns beide Provider ab:
 * ein Token-Format und ein Endpunkt für iOS (APNs) wie Android (FCM) — die
 * Provider-Zugangsdaten liegen bei Expo, nicht hier.
 *
 * `EXPO_ACCESS_TOKEN` ist optional. Ohne ihn funktioniert der Versand, aber
 * jeder, der einen Token kennt, könnte an dieses Gerät senden; mit ihm nimmt
 * Expo nur noch Anfragen mit gültigem Token an ("enhanced push security").
 */

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
/** Expo nimmt maximal 100 Nachrichten pro Anfrage entgegen. */
const MAX_MESSAGES_PER_REQUEST = 100;
const REQUEST_TIMEOUT_MS = 10_000;
/** Grenze für den Meldungstext — auf dem Sperrbildschirm ist ohnehin früher Schluss. */
const MAX_BODY_LENGTH = 180;

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default";
  channelId?: string;
};

/** Ergebnis je Token — auf das reduziert, was der Aufrufer braucht. */
export type ExpoPushResult = {
  token: string;
  ok: boolean;
  /** Fehlercode von Expo, für uns relevant: "DeviceNotRegistered". */
  error?: string;
};

type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

/**
 * `PushSubscription` kann auch Web-Push-Endpunkte enthalten (Spalten-Default
 * "web") — die versteht dieser Weg nicht, also vorher aussortieren.
 */
export function isExpoPushToken(token: string) {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

/** Macht aus einem mehrzeiligen Mailtext eine einzeilige Push-Zeile. */
export function toPushBody(text: string) {
  const singleLine = text.replace(/\s+/g, " ").trim();

  return singleLine.length > MAX_BODY_LENGTH
    ? `${singleLine.slice(0, MAX_BODY_LENGTH - 1)}…`
    : singleLine;
}

/**
 * Verschickt die Nachrichten und liefert pro Token zurück, ob Expo sie
 * angenommen hat. Wirft nicht: Push ist ein Nebenkanal, ein Ausfall darf den
 * auslösenden Vorgang (Urlaubsantrag, Schichtänderung …) nicht scheitern
 * lassen — die Zustellung über E-Mail und In-App läuft davon unabhängig.
 */
export async function sendExpoPushMessages(
  messages: ExpoPushMessage[],
): Promise<ExpoPushResult[]> {
  const results: ExpoPushResult[] = [];

  for (let index = 0; index < messages.length; index += MAX_MESSAGES_PER_REQUEST) {
    const chunk = messages.slice(index, index + MAX_MESSAGES_PER_REQUEST);
    results.push(...(await sendChunk(chunk)));
  }

  return results;
}

async function sendChunk(chunk: ExpoPushMessage[]): Promise<ExpoPushResult[]> {
  const failed = () => chunk.map((message) => ({ token: message.to, ok: false }));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  let response: Response;

  try {
    response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logger.warn("Expo-Push nicht erreichbar.", {
      count: chunk.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return failed();
  }

  if (!response.ok) {
    logger.warn("Expo-Push mit Fehlerstatus.", {
      status: response.status,
      count: chunk.length,
    });
    return failed();
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: ExpoPushTicket[];
  } | null;
  const tickets = payload?.data;

  // Die Zuordnung Ticket -> Nachricht läuft ausschließlich über die
  // Reihenfolge. Passt die Länge nicht, ist jede Zuordnung geraten — dann
  // lieber nichts als versehentlich den falschen Token löschen.
  if (!Array.isArray(tickets) || tickets.length !== chunk.length) {
    logger.warn("Expo-Push: unerwartete Antwortform.", { count: chunk.length });
    return failed();
  }

  return chunk.map((message, index) => {
    const ticket = tickets[index];

    if (ticket.status === "ok") {
      return { token: message.to, ok: true };
    }

    logger.warn("Expo-Push abgelehnt.", {
      error: ticket.details?.error,
      message: ticket.message,
    });

    return { token: message.to, ok: false, error: ticket.details?.error };
  });
}
