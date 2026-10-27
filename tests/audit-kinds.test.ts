import { describe, expect, it } from "vitest";
import { classifyAuditEntry, isSensitiveAuditEntry } from "@/lib/audit-kinds";

/** Einordnung der Audit-Einträge für Filter und Kennzahlen der Audit-Log-Seite. */

describe("Audit-Arten", () => {
  it("leitet die Art aus dem Aktionstext ab", () => {
    const kind = (action: string, entityType = "employee") => classifyAuditEntry({ action, entityType });

    expect(kind("Mitarbeiter angelegt")).toBe("created");
    expect(kind("Urlaubsantrag genehmigt", "vacation")).toBe("created");
    expect(kind("Stundenreport exportiert", "hours-report")).toBe("export");
    expect(kind("Datei gelöscht", "file")).toBe("deleted");
    expect(kind("Rolle geändert", "role")).toBe("rights");
    expect(kind("Lohnabrechnung geöffnet", "payroll")).toBe("access");
    expect(kind("Schichtplan veröffentlicht", "shift-week")).toBe("changed");
  });

  it("erkennt sensible Bereiche", () => {
    expect(isSensitiveAuditEntry({ entityType: "payroll", source: "Lohn", action: "geöffnet" })).toBe(true);
    expect(isSensitiveAuditEntry({ entityType: "team", source: "Teams", action: "Team angelegt" })).toBe(false);
  });
});
