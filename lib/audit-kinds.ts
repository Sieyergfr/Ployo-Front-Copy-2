/**
 * Art eines Audit-Eintrags für Filter und Kennzahlen der Audit-Log-Seite —
 * abgeleitet aus dem (deutschen) Aktionstext, den `recordTenantAudit`
 * schreibt. Rein und clientsicher.
 */
export const auditKinds = ["created", "changed", "deleted", "access", "export", "rights", "login"] as const;
export type AuditKind = (typeof auditKinds)[number];

const RULES: Array<[AuditKind, RegExp]> = [
  ["login", /angemeldet|anmeld|login|zwei-faktor|2fa|passwort/i],
  ["export", /export|versendet|datenauskunft|heruntergeladen|download/i],
  ["deleted", /gelöscht|entfernt|widerrufen|storniert|abgelehnt|deaktiviert|gesperrt/i],
  ["access", /angesehen|geöffnet|eingesehen|abgerufen|zugriff/i],
  ["created", /angelegt|erstellt|hochgeladen|hinzugefügt|eingeladen|erfasst|beantragt|genehmigt|übernommen/i],
];

export function classifyAuditEntry(entry: { action: string; entityType: string }): AuditKind {
  if (entry.entityType === "role" || /rolle|berechtigung|rechte/i.test(entry.action)) {
    return "rights";
  }

  for (const [kind, pattern] of RULES) {
    if (pattern.test(entry.action)) return kind;
  }

  return "changed";
}

/** Bereiche mit sensiblen Daten (Bank, Lohn, Gesundheit) für die Kennzahl „Zugriffe auf sensible Daten“. */
export function isSensitiveAuditEntry(entry: { entityType: string; source: string; action: string }) {
  return /payroll|sickness|sensitive|contract/i.test(entry.entityType) || /lohn|krank|sensibl|bank|iban/i.test(`${entry.source} ${entry.action}`);
}
