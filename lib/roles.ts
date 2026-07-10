export type PermissionLevel = "none" | "read" | "write" | "admin";

export type PermissionArea = {
  id: string;
  label: string;
  description: string;
};

export type PermissionRole = {
  id: string;
  key: string;
  name: string;
  description: string;
  members: number;
  isSystem: boolean;
  permissions: Record<string, PermissionLevel>;
};

export const permissionLevels = ["none", "read", "write", "admin"] as const;

export const permissionAreas: PermissionArea[] = [
  { id: "employees", label: "Mitarbeiter", description: "Personalakte, Kontakte, Notfallkontakte" },
  { id: "payroll", label: "Gehaltsabrechnungen", description: "Abrechnungen, Verguetung, sensible Dokumente" },
  { id: "locations", label: "Standorte", description: "Standortdaten, Schichten, Teams vor Ort" },
  { id: "teams", label: "Teams", description: "Teamrollen, Teamleitung, Mitglieder" },
  { id: "files", label: "Dateien", description: "Ablage, Versionen, Ablaufdaten, Freigaben" },
  { id: "vacation", label: "Urlaub", description: "Antraege, Kontingente, Freigaben" },
  { id: "sickness", label: "Krankheit", description: "Krankmeldungen, Atteste, Abschluss" },
  { id: "shifts", label: "Schichtplanung", description: "Dienstplaene, Wochenplanung, Konflikte" },
  { id: "reminders", label: "Erinnerungen", description: "Fristen, Wiedervorlagen, Eskalationen" },
  { id: "audit", label: "Audit Logs", description: "Zugriffe, Aenderungen, Exporte" },
  { id: "roles", label: "Rollen", description: "Berechtigungen und Sicherheitsrichtlinien" },
  { id: "settings", label: "Einstellungen", description: "Mandant, Integrationen, Abrechnung" },
];

export const defaultPermissionRoles: Omit<PermissionRole, "id" | "members">[] = [
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
  },
  {
    key: "payroll",
    name: "Lohnbuchhaltung",
    description: "Fokus auf Abrechnung, Vertraege und exportrelevante Daten.",
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
  },
  {
    key: "teamlead",
    name: "Teamleitung",
    description: "Operative Planung fuer eigene Teams und Standorte.",
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
  },
  {
    key: "employee",
    name: "Mitarbeiter",
    description: "Self-Service fuer eigene Daten, Dokumente und Antraege.",
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
  },
];

export const permissionRoles: PermissionRole[] = defaultPermissionRoles.map((role) => ({
  ...role,
  id: role.key,
  members: 0,
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

export function emptyPermissionSet() {
  return Object.fromEntries(
    permissionAreas.map((area) => [area.id, "none" satisfies PermissionLevel]),
  ) as Record<string, PermissionLevel>;
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
