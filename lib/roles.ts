export type PermissionLevel = "none" | "read" | "write" | "admin";
export type PermissionScope = "own" | "team" | "all" | "assigned";

export type PermissionArea = {
  id: string;
  label: string;
  description: string;
  /**
   * Ob für diesen Bereich eine Sichtbarkeits-Auswahl (eigene/Team/alle)
   * angeboten wird. Bewusst nur für Bereiche aktiviert, in denen der Scope
   * auch tatsächlich serverseitig durchgesetzt wird (siehe
   * `resolveScopeFilter` in lib/tenant-access.ts) — ein Schalter ohne Wirkung
   * ist genau der Bug, den diese Auswahl ersetzt.
   */
  supportsScope: boolean;
  /**
   * Ob für diesen Bereich Datei-Fähigkeiten (Hochladen/Bearbeiten/Sehen)
   * getrennt vom allgemeinen level konfigurierbar sind — für Bereiche, in
   * denen Dokumente an fachliche Datensätze gebunden sind (Personalakte,
   * Gehaltsabrechnungen, Standorte, Krankmeldungen). Das eigenständige
   * "files"-Modul selbst braucht das nicht, es hat bereits sein eigenes level.
   */
  fileRelevant: boolean;
  /**
   * Ob für diesen Bereich der Scope "assigned" (der eigene Standort bzw. die
   * eigenen Teams) angeboten wird — bewusst nur für locations/teams, wo
   * `resolveScopeFilter` das auch tatsächlich auflösen kann.
   */
  supportsAssignedScope: boolean;
};

export type PermissionRole = {
  id: string;
  key: string;
  name: string;
  description: string;
  members: number;
  isSystem: boolean;
  permissions: Record<string, PermissionLevel>;
  scopes: Record<string, PermissionScope>;
  canDelete: Record<string, boolean>;
  canUploadFiles: Record<string, boolean>;
  canEditFiles: Record<string, boolean>;
  canViewFiles: Record<string, boolean>;
  canViewAudit: Record<string, boolean>;
  /** Nur für locations/teams gesetzt (siehe `supportsAssignedScope`) — sonst null. */
  shiftsLevel: Record<string, PermissionLevel | null>;
};

export const permissionLevels = ["none", "read", "write", "admin"] as const;
export const permissionScopes = ["own", "team", "all", "assigned"] as const;

export const permissionScopeLabels = {
  own: "Nur eigene",
  team: "Team",
  all: "Alle",
  assigned: "Zugewiesen",
} satisfies Record<PermissionScope, string>;

export const permissionScopeDescriptions = {
  own: "Nur die eigenen Daten",
  team: "Daten des eigenen Teams",
  all: "Daten aller Mitarbeiter",
  assigned: "Nur der zugewiesene Standort bzw. die eigenen Teams",
} satisfies Record<PermissionScope, string>;

/**
 * Gemeinsam von Server- und Client-Code genutzt (z. B. um Aktions-Buttons
 * ein-/auszublenden), damit die Hierarchie none < read < write < admin nicht
 * an mehreren Stellen dupliziert wird.
 */
export function hasPermissionLevel(
  actual: PermissionLevel,
  required: PermissionLevel,
) {
  return permissionLevels.indexOf(actual) >= permissionLevels.indexOf(required);
}

export const permissionAreas: PermissionArea[] = [
  { id: "employees", label: "Mitarbeiter", description: "Name, Team, Standort, Kontakt, Notfallkontakte — ohne Geburts-/Finanzdaten", supportsScope: true, fileRelevant: true, supportsAssignedScope: false },
  { id: "payroll", label: "Gehaltsabrechnungen", description: "Abrechnungen, Verträge, sowie Geburtsdatum/-ort, Steuer-ID, IBAN, Krankenkasse, Privatadresse", supportsScope: true, fileRelevant: true, supportsAssignedScope: false },
  { id: "locations", label: "Standorte", description: "Standortdaten, Schichten, Teams vor Ort", supportsScope: false, fileRelevant: true, supportsAssignedScope: true },
  { id: "teams", label: "Teams", description: "Teamrollen, Teamleitung, Mitglieder", supportsScope: false, fileRelevant: true, supportsAssignedScope: true },
  { id: "files", label: "Dateien", description: "Ablage, Versionen, Ablaufdaten, Freigaben", supportsScope: true, fileRelevant: false, supportsAssignedScope: false },
  { id: "vacation", label: "Urlaub", description: "Anträge, Kontingente, Freigaben", supportsScope: true, fileRelevant: false, supportsAssignedScope: false },
  { id: "sickness", label: "Krankheit", description: "Krankmeldungen, Atteste, Abschluss", supportsScope: true, fileRelevant: true, supportsAssignedScope: false },
  { id: "shifts", label: "Schichtplanung", description: "Dienstpläne, Wochenplanung, Konflikte", supportsScope: true, fileRelevant: false, supportsAssignedScope: false },
  { id: "reminders", label: "Erinnerungen", description: "Fristen, Wiedervorlagen, Eskalationen", supportsScope: true, fileRelevant: false, supportsAssignedScope: false },
  { id: "audit", label: "Audit Logs", description: "Zugriffe, Änderungen, Exporte", supportsScope: false, fileRelevant: false, supportsAssignedScope: false },
  { id: "roles", label: "Rollen", description: "Berechtigungen und Sicherheitsrichtlinien", supportsScope: false, fileRelevant: false, supportsAssignedScope: false },
  { id: "settings", label: "Einstellungen", description: "Mandant, Integrationen, Abrechnung", supportsScope: false, fileRelevant: false, supportsAssignedScope: false },
];

/**
 * Die Default-Rollen definieren bewusst nur permissions/scopes von Hand —
 * canDelete/canUploadFiles/canEditFiles/canViewFiles/canViewAudit werden
 * unten in `permissionRoles` aus dem level abgeleitet (siehe
 * `deriveCapabilitiesFromLevels`), exakt nach derselben Regel wie die
 * Backfill-Migration für bestehende Rollen
 * (20260810130500_backfill_role_permission_capabilities). So bleiben neu
 * angelegte Default-Rollen konsistent mit migrierten Bestandsrollen, statt
 * dieselbe Ableitung zweimal von Hand zu pflegen.
 */
export const defaultPermissionRoles: Omit<
  PermissionRole,
  "id" | "members" | "canDelete" | "canUploadFiles" | "canEditFiles" | "canViewFiles" | "canViewAudit" | "shiftsLevel"
>[] = [
  {
    key: "hr-lead",
    name: "HR-Leitung",
    description: "Vollzugriff auf Personalprozesse und Sicherheitsprotokolle.",
    isSystem: true,
    permissions: {
      employees: "admin",
      payroll: "admin",
      locations: "write",
      teams: "admin",
      files: "admin",
      vacation: "admin",
      sickness: "admin",
      shifts: "write",
      reminders: "admin",
      audit: "read",
      roles: "admin",
      settings: "write",
    },
    scopes: { employees: "all", payroll: "all", vacation: "all", sickness: "all" },
  },
  {
    key: "payroll",
    name: "Lohnbuchhaltung",
    description: "Fokus auf Abrechnung, Verträge und exportrelevante Daten.",
    isSystem: true,
    permissions: {
      employees: "read",
      payroll: "admin",
      locations: "read",
      teams: "read",
      files: "write",
      vacation: "read",
      sickness: "read",
      shifts: "read",
      reminders: "write",
      audit: "read",
      roles: "none",
      settings: "none",
    },
    scopes: { employees: "all", payroll: "all", vacation: "all", sickness: "all" },
  },
  {
    key: "teamlead",
    name: "Teamleitung",
    description: "Operative Planung für eigene Teams und Standorte.",
    isSystem: true,
    permissions: {
      employees: "read",
      payroll: "none",
      locations: "read",
      teams: "write",
      files: "read",
      vacation: "write",
      sickness: "read",
      shifts: "admin",
      reminders: "write",
      audit: "none",
      roles: "none",
      settings: "none",
    },
    // Teamleitung plant und genehmigt fuer das eigene Team — nicht
    // mandantenweit.
    scopes: { employees: "team", vacation: "team", sickness: "team" },
  },
  {
    key: "employee",
    name: "Mitarbeiter",
    description: "Self-Service für eigene Daten, Dokumente und Anträge.",
    isSystem: true,
    permissions: {
      employees: "read",
      payroll: "read",
      locations: "none",
      teams: "read",
      files: "read",
      vacation: "write",
      sickness: "write",
      shifts: "read",
      reminders: "read",
      audit: "none",
      roles: "none",
      settings: "none",
    },
    // Ein einfaches Mitgliedskonto sieht standardmaessig nur das eigene Team
    // im Verzeichnis und nur die eigenen Gehalts-/Urlaubs-/Krankheitsdaten —
    // nicht die des gesamten Unternehmens.
    scopes: { employees: "team", payroll: "own", vacation: "own", sickness: "own" },
  },
];

/**
 * Selbe Ableitungsregel wie die Backfill-Migration
 * (20260810130500_backfill_role_permission_capabilities): canDelete gilt ab
 * "write" (alle Bereiche); Datei-Fähigkeiten nur für `fileRelevant`-Bereiche
 * (ab "write" für Hochladen/Bearbeiten, ab "read" für Sehen); canViewAudit
 * kommt einheitlich aus dem bisherigen globalen "audit"-Level der Rolle.
 */
function deriveCapabilitiesFromLevels(permissions: Record<string, PermissionLevel>) {
  const auditReadable = hasPermissionLevel(permissions.audit ?? "none", "read");
  const canDelete: Record<string, boolean> = {};
  const canUploadFiles: Record<string, boolean> = {};
  const canEditFiles: Record<string, boolean> = {};
  const canViewFiles: Record<string, boolean> = {};
  const canViewAudit: Record<string, boolean> = {};

  for (const area of permissionAreas) {
    const level = permissions[area.id] ?? "none";

    canDelete[area.id] = hasPermissionLevel(level, "write");
    canViewAudit[area.id] = auditReadable;
    canUploadFiles[area.id] = area.fileRelevant && hasPermissionLevel(level, "write");
    canEditFiles[area.id] = area.fileRelevant && hasPermissionLevel(level, "write");
    canViewFiles[area.id] = area.fileRelevant && hasPermissionLevel(level, "read");
  }

  return { canDelete, canUploadFiles, canEditFiles, canViewFiles, canViewAudit };
}

/** Keine Default-Rolle bekommt vorab eine erweiterte Schichtberechtigung — das konfiguriert der Rollen-Editor gezielt. */
export function emptyShiftsLevelSet(): Record<string, PermissionLevel | null> {
  return Object.fromEntries(permissionAreas.map((area) => [area.id, null]));
}

export function emptyBooleanCapabilitySet(): Record<string, boolean> {
  return Object.fromEntries(permissionAreas.map((area) => [area.id, false]));
}

export const permissionRoles: PermissionRole[] = defaultPermissionRoles.map((role) => ({
  ...role,
  id: role.key,
  members: 0,
  scopes: { ...fullPermissionScopeSet(), ...role.scopes },
  ...deriveCapabilitiesFromLevels(role.permissions),
  shiftsLevel: emptyShiftsLevelSet(),
}));

export const permissionLevelLabels = {
  none: "Kein Zugriff",
  read: "Lesen",
  write: "Schreiben",
  admin: "Admin",
} satisfies Record<PermissionLevel, string>;

export function isPermissionLevel(value: FormDataEntryValue | null): value is PermissionLevel {
  return typeof value === "string" && permissionLevels.includes(value as PermissionLevel);
}

export function normalizePermissionLevel(value: FormDataEntryValue | null): PermissionLevel {
  return isPermissionLevel(value) ? value : "none";
}

export function isPermissionScope(value: FormDataEntryValue | null): value is PermissionScope {
  return typeof value === "string" && permissionScopes.includes(value as PermissionScope);
}

export function normalizePermissionScope(value: FormDataEntryValue | null): PermissionScope {
  return isPermissionScope(value) ? value : "all";
}

export function emptyPermissionSet() {
  return Object.fromEntries(
    permissionAreas.map((area) => [area.id, "none" satisfies PermissionLevel]),
  ) as Record<string, PermissionLevel>;
}

export function fullPermissionScopeSet() {
  return Object.fromEntries(
    permissionAreas.map((area) => [area.id, "all" satisfies PermissionScope]),
  ) as Record<string, PermissionScope>;
}

export function normalizeRoleKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
