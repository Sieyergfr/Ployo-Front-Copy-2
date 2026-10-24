import { describe, expect, it } from "vitest";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";

describe("mapSelfServiceError — Schichtplanung", () => {
  it("reicht die Überschneidungs-Meldung als 409 mit Klartext durch statt als 500", async () => {
    const message =
      "Konflikt mit bestehender Schicht: Die Person ist am 08.10.2026 bereits von 08:00 bis 16:00 Uhr (Filiale Mitte) eingeplant. " +
      "Die neue Schicht (12:00–20:00 Uhr) überschneidet sich damit.";
    const response = mapSelfServiceError(new Error(message));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: message });
  });

  it("mappt die Sammelmeldung beim Veröffentlichen auf 400", () => {
    const response = mapSelfServiceError(
      new Error("Veröffentlichung abgebrochen — 1 Schicht(en) verstoßen gegen geltende Arbeitszeitregeln:\nA (2026-10-08): Konflikt mit bestehender Schicht: …"),
    );

    expect(response.status).toBe(400);
  });

  it("mappt fehlenden Gesamt-Scope für wochenweite Aktionen auf 403", () => {
    const response = mapSelfServiceError(
      new Error(
        "Diese Aktion wirkt sich auf die gesamte Wochenplanung aller Teams aus und erfordert uneingeschränkte Schichtplan-Berechtigung.",
      ),
    );

    expect(response.status).toBe(403);
  });

  it("wirft unbekannte Meldungen weiter (kein Leak interner Fehler)", () => {
    expect(() => mapSelfServiceError(new Error("prisma: connection refused"))).toThrow();
  });
});

describe("mapSelfServiceError — Urlaub & weitere Fachmeldungen", () => {
  it.each([
    [
      "Der gewählte Zeitraum enthält laut hinterlegtem Dienstplan keinen einzigen Arbeitstag — dafür ist kein Urlaubsantrag nötig.",
      400,
    ],
    ["Über den eigenen Urlaubsantrag kann nicht selbst entschieden werden.", 403],
    ["Der Genehmigungsstatus dieses Antrags hat sich zwischenzeitlich geändert. Bitte die Seite neu laden.", 409],
    [
      "Der Genehmigungsstatus dieses Antrags hat sich zwischenzeitlich geändert. Bitte die Seite neu laden und erneut versuchen.",
      409,
    ],
    ['Bitte einen Abrechnungszeitraum angeben (z. B. "Januar 2026").', 400],
    ["Für diesen Mandanten ist eine Personalnummer verpflichtend. Bitte eine Personalnummer angeben.", 400],
    ['Die Personalnummer "P-007" ist bereits an einen anderen Mitarbeiter vergeben.', 409],
    ["Diese Datei enthält aktive Inhalte (HTML/Skript) und kann nicht hochgeladen werden.", 400],
    ['Der Dateiinhalt entspricht nicht der Dateiendung ".pdf".', 400],
  ])("reicht %s mit Klartext durch", async (message, status) => {
    const response = mapSelfServiceError(new Error(message));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
  });

  it("lässt Konfigurations-/Interna weiterhin nicht durch", () => {
    expect(() => mapSelfServiceError(new Error("EMAIL_NOT_CONFIGURED"))).toThrow();
    expect(() => mapSelfServiceError(new Error("Storage-Konfiguration fehlt: S3_BUCKET"))).toThrow();
  });
});
