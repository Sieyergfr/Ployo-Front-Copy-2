export type PermissionLevel = "none" | "read" | "write" | "admin";

export type PermissionArea = {
  id: string;
  label: string;
  description: string;
};

export type PermissionRole = {
  id: string;
  name: string;
  description: string;
  members: number;
  permissions: Record<string, PermissionLevel>;
};

export const permissionAreas: PermissionArea[] = [
  { id: "employees", label: "Mitarbeiter", description: "Personalakte, Kontakte, Notfallkontakte" },
  { id: "payroll", label: "Gehaltsabrechnungen", description: "Abrechnungen, Vergütung, sensible Dokumente" },
  { id: "locations", label: "Standorte", description: "Standortdaten, Schichten, Teams vor Ort" },
  { id: "teams", label: "Teams", description: "Teamrollen, Teamleitung, Mitglieder" },
  { id: "files", label: "Dateien", description: "Ablage, Versionen, Ablaufdaten, Freigaben" },
  { id: "vacation", label: "Urlaub", description: "Anträge, Kontingente, Freigaben" },
  { id: "sickness", label: "Krankheit", description: "Krankmeldungen, Atteste, Abschluss" },
  { id: "shifts", label: "Schichtplanung", description: "Dienstpläne, Wochenplanung, Konflikte" },
  { id: "reminders", label: "Erinnerungen", description: "Fristen, Wiedervorlagen, Eskalationen" },
  { id: "audit", label: "Audit Logs", description: "Zugriffe, Änderungen, Exporte" },
  { id: "roles", label: "Rollen", description: "Berechtigungen und Sicherheitsrichtlinien" },
  { id: "settings", label: "Einstellungen", description: "Mandant, Integrationen, Abrechnung" },
];

export const permissionRoles: PermissionRole[] = [
  {
    id: "hr-lead",
    name: "HR-Leitung",
    description: "Vollzugriff auf Personalprozesse und Sicherheitsprotokolle.",
    members: 3,
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
    id: "payroll",
    name: "Lohnbuchhaltung",
    description: "Fokus auf Abrechnung, Verträge und exportrelevante Daten.",
    members: 5,
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
    id: "teamlead",
    name: "Teamleitung",
    description: "Operative Planung für eigene Teams und Standorte.",
    members: 14,
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
    id: "employee",
    name: "Mitarbeiter",
    description: "Self-Service für eigene Daten, Dokumente und Anträge.",
    members: 225,
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

export const permissionLevelLabels = {
  none: "Kein Zugriff",
  read: "Lesen",
  write: "Schreiben",
  admin: "Admin",
} satisfies Record<PermissionLevel, string>;
