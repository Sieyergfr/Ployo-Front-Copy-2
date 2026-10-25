import { describe, expect, it } from "vitest";
import { parseEmployeeCsv } from "@/lib/employee-csv";

describe("parseEmployeeCsv", () => {
  it("liest Excel-CSV mit Semikolon, BOM, Anführungszeichen und deutschem Datum", () => {
    const result = parseEmployeeCsv(
      '﻿Vorname;Nachname;E-Mail;Standort;Team;Eintritt\r\nLea;Hoffmann;lea@x.de;"Filiale; Mitte";Service;1.11.2026\r\n\r\n;;;;;\r\n',
    );

    expect(result.error).toBeUndefined();
    expect(result.rows).toEqual([
      {
        firstName: "Lea",
        lastName: "Hoffmann",
        email: "lea@x.de",
        employeeNumber: "",
        location: "Filiale; Mitte",
        team: "Service",
        contract: "",
        weeklyHours: "",
        startDate: "2026-11-01",
      },
    ]);
  });

  it("erkennt Komma als Trennzeichen und englische Spalten", () => {
    const result = parseEmployeeCsv("First name,Last name,Email\nAnna,Berg,anna@x.de\n");

    expect(result.rows[0]).toMatchObject({ firstName: "Anna", lastName: "Berg", email: "anna@x.de" });
  });

  it("meldet fehlende Kopfzeile und leere Dateien", () => {
    expect(parseEmployeeCsv("a;b\n1;2").error).toBe("noHeader");
    expect(parseEmployeeCsv("Vorname;Nachname").error).toBe("empty");
  });
});
