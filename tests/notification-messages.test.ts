import { describe, expect, it } from "vitest";
import {
  formatNotificationDate,
  formatNotificationRange,
  renderNotification,
  toNotificationLocale,
  type NotificationMessage,
} from "@/lib/notifications/messages";

describe("toNotificationLocale", () => {
  it("erkennt unterstützte Sprachen", () => {
    expect(toNotificationLocale("en")).toBe("en");
    expect(toNotificationLocale("de")).toBe("de");
  });

  it("fällt bei Unbekanntem auf Deutsch zurück", () => {
    expect(toNotificationLocale("fr")).toBe("de");
    expect(toNotificationLocale(null)).toBe("de");
    expect(toNotificationLocale(undefined)).toBe("de");
  });
});

describe("Datumsformate", () => {
  it("schreibt das Datum in der Schreibweise der Empfänger-Sprache", () => {
    expect(formatNotificationDate("2026-08-23", "de")).toBe("23.08.2026");
    expect(formatNotificationDate("2026-08-23", "en")).toBe("08/23/2026");
  });

  it("kennzeichnet offene Zeiträume ohne Enddatum", () => {
    expect(formatNotificationRange("2026-08-23", null, "de")).toBe("ab 23.08.2026");
    expect(formatNotificationRange("2026-08-23", null, "en")).toBe("from 08/23/2026");
  });
});

describe("renderNotification", () => {
  it("übersetzt eine Urlaubsentscheidung in beide Sprachen", () => {
    const message = {
      key: "vacationDecided",
      tenantName: "Acme",
      startDate: "2026-08-24",
      endDate: "2026-08-28",
      status: "approved",
    } as const;

    const de = renderNotification(message, "de");
    const en = renderNotification(message, "en");

    expect(de.subject).toBe("Urlaubsantrag genehmigt");
    expect(de.text).toContain("24.08.2026 – 28.08.2026");
    expect(en.subject).toBe("Vacation request approved");
    expect(en.text).toContain("08/24/2026 – 08/28/2026");
  });

  it("baut die Kalenderwoche aus der Zahl, nicht aus einem festen Label", () => {
    const message: NotificationMessage = {
      key: "shiftPlanPublished",
      tenantName: "Acme",
      week: 35,
      weekRange: "24.08-30.08.2026",
      shifts: [{ date: "2026-08-24", startTime: "08:00", endTime: "16:00" }],
    };

    expect(renderNotification(message, "de").subject).toBe("Schichtplan KW 35 veröffentlicht");
    expect(renderNotification(message, "en").subject).toBe(
      "Shift plan for week 35 published",
    );
  });

  it("maskiert Nutzereingaben in der HTML-Fassung", () => {
    const rendered = renderNotification(
      {
        key: "newVacationRequest",
        tenantName: "Acme",
        employeeName: "<script>alert(1)</script>",
        startDate: "2026-08-24",
        endDate: "2026-08-28",
      },
      "de",
    );

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("hängt einen Ablehnungsgrund an, wenn einer vorliegt", () => {
    const withReason = renderNotification(
      {
        key: "wishFreeDecided",
        tenantName: "Acme",
        date: "2026-08-24",
        status: "rejected",
        rejectReason: "Unterbesetzung",
      },
      "en",
    );
    const withoutReason = renderNotification(
      {
        key: "wishFreeDecided",
        tenantName: "Acme",
        date: "2026-08-24",
        status: "rejected",
        rejectReason: "",
      },
      "en",
    );

    expect(withReason.text).toContain("Reason: Unterbesetzung");
    expect(withoutReason.text).not.toContain("Reason:");
  });
});
