import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isExpoPushToken,
  sendExpoPushMessages,
  toPushBody,
  type ExpoPushMessage,
} from "@/lib/notifications/expo-push";

function message(to: string): ExpoPushMessage {
  return { to, title: "Titel", body: "Text" };
}

function respondWith(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isExpoPushToken", () => {
  it("erkennt beide Schreibweisen des Expo-Tokens", () => {
    expect(isExpoPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
  });

  it("sortiert alles andere aus", () => {
    // Web-Push-Endpunkte landen in derselben Tabelle (Spalten-Default "web").
    expect(isExpoPushToken("https://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[]")).toBe(false);
    expect(isExpoPushToken("")).toBe(false);
  });
});

describe("toPushBody", () => {
  it("macht aus mehrzeiligem Mailtext eine Zeile", () => {
    expect(toPushBody("Zeile eins\n\nZeile zwei")).toBe("Zeile eins Zeile zwei");
  });

  it("kürzt lange Texte mit Auslassungszeichen", () => {
    const result = toPushBody("a".repeat(300));

    expect(result).toHaveLength(180);
    expect(result.endsWith("…")).toBe(true);
  });

  it("lässt kurze Texte unangetastet", () => {
    expect(toPushBody("Dein Urlaub wurde genehmigt.")).toBe("Dein Urlaub wurde genehmigt.");
  });
});

describe("sendExpoPushMessages", () => {
  it("meldet erfolgreiche Zustellung je Token zurück", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith({ data: [{ status: "ok", id: "ticket-1" }] }),
    );

    const results = await sendExpoPushMessages([message("ExponentPushToken[a]")]);

    expect(results).toEqual([{ token: "ExponentPushToken[a]", ok: true }]);
  });

  it("reicht den Fehlercode zum richtigen Token durch", async () => {
    // Die Zuordnung läuft nur über die Reihenfolge — genau hier würde ein
    // Fehler den falschen Token als tot markieren.
    vi.stubGlobal(
      "fetch",
      respondWith({
        data: [
          { status: "ok", id: "ticket-1" },
          { status: "error", message: "…", details: { error: "DeviceNotRegistered" } },
        ],
      }),
    );

    const results = await sendExpoPushMessages([
      message("ExponentPushToken[lebt]"),
      message("ExponentPushToken[tot]"),
    ]);

    expect(results).toEqual([
      { token: "ExponentPushToken[lebt]", ok: true },
      { token: "ExponentPushToken[tot]", ok: false, error: "DeviceNotRegistered" },
    ]);
  });

  it("markiert nichts als tot, wenn die Antwortlänge nicht passt", async () => {
    vi.stubGlobal("fetch", respondWith({ data: [{ status: "ok", id: "ticket-1" }] }));

    const results = await sendExpoPushMessages([
      message("ExponentPushToken[a]"),
      message("ExponentPushToken[b]"),
    ]);

    expect(results.every((result) => !result.ok && result.error === undefined)).toBe(true);
  });

  it("wirft nicht, wenn Expo nicht erreichbar ist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const results = await sendExpoPushMessages([message("ExponentPushToken[a]")]);

    expect(results).toEqual([{ token: "ExponentPushToken[a]", ok: false }]);
  });

  it("wirft nicht bei Fehlerstatus", async () => {
    vi.stubGlobal("fetch", respondWith({}, { ok: false, status: 500 }));

    const results = await sendExpoPushMessages([message("ExponentPushToken[a]")]);

    expect(results).toEqual([{ token: "ExponentPushToken[a]", ok: false }]);
  });

  it("teilt mehr als 100 Nachrichten auf mehrere Anfragen auf", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const sent = JSON.parse((init as RequestInit).body as string) as ExpoPushMessage[];

      return {
        ok: true,
        status: 200,
        json: async () => ({ data: sent.map((_, index) => ({ status: "ok", id: `t${index}` })) }),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const messages = Array.from({ length: 150 }, (_, index) =>
      message(`ExponentPushToken[${index}]`),
    );
    const results = await sendExpoPushMessages(messages);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(150);
    expect(results.every((result) => result.ok)).toBe(true);
  });
});
