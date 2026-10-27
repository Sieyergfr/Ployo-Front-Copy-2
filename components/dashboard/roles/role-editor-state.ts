import {
  emptyBooleanCapabilitySet,
  emptyPermissionSet,
  emptyShiftsLevelSet,
  fullPermissionScopeSet,
  permissionAreas,
  type PermissionArea,
  type PermissionLevel,
  type PermissionRole,
  type PermissionScope,
} from "@/lib/roles";
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Clock,
  FileText,
  Heart,
  Landmark,
  MapPin,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Thermometer,
  Sun,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

/**
 * Zustand des Rollen-Editors (Detail + Erstellen). Abgeschickt wird über
 * versteckte Felder mit genau den Namen, die `lib/role-service.ts`
 * (`permissionsFromFormData` usw.) schon immer liest — die Server-Actions
 * bleiben dadurch unverändert.
 */
export type RoleEditorState = {
  permissions: Record<string, PermissionLevel>;
  scopes: Record<string, PermissionScope>;
  canDelete: Record<string, boolean>;
  canUploadFiles: Record<string, boolean>;
  canEditFiles: Record<string, boolean>;
  canViewFiles: Record<string, boolean>;
  canViewAudit: Record<string, boolean>;
  shiftsLevel: Record<string, PermissionLevel | null>;
};

export type BooleanCapability = "canDelete" | "canUploadFiles" | "canEditFiles" | "canViewFiles" | "canViewAudit";

export const booleanCapabilityFields: Record<BooleanCapability, string> = {
  canDelete: "can-delete",
  canUploadFiles: "can-upload-files",
  canEditFiles: "can-edit-files",
  canViewFiles: "can-view-files",
  canViewAudit: "can-view-audit",
};

export function emptyRoleEditorState(): RoleEditorState {
  return {
    permissions: emptyPermissionSet(),
    scopes: fullPermissionScopeSet(),
    canDelete: emptyBooleanCapabilitySet(),
    canUploadFiles: emptyBooleanCapabilitySet(),
    canEditFiles: emptyBooleanCapabilitySet(),
    canViewFiles: emptyBooleanCapabilitySet(),
    canViewAudit: emptyBooleanCapabilitySet(),
    shiftsLevel: emptyShiftsLevelSet(),
  };
}

export function roleEditorStateFromRole(role: PermissionRole): RoleEditorState {
  const base = emptyRoleEditorState();

  return {
    permissions: { ...base.permissions, ...role.permissions },
    scopes: { ...base.scopes, ...role.scopes },
    canDelete: { ...base.canDelete, ...role.canDelete },
    canUploadFiles: { ...base.canUploadFiles, ...role.canUploadFiles },
    canEditFiles: { ...base.canEditFiles, ...role.canEditFiles },
    canViewFiles: { ...base.canViewFiles, ...role.canViewFiles },
    canViewAudit: { ...base.canViewAudit, ...role.canViewAudit },
    shiftsLevel: { ...base.shiftsLevel, ...role.shiftsLevel },
  };
}

/** Wie der bisherige Editor: Sichtbarkeit nur bei Bereichen mit Auswahl, Zusatzrechte nur mit Zugriff. */
export function areaHasVisibility(area: PermissionArea) {
  return area.supportsScope || area.supportsAssignedScope;
}

export function visibilityOptions(area: PermissionArea): PermissionScope[] {
  if (area.supportsScope) return ["own", "team", "all"];
  if (area.supportsAssignedScope) return ["all", "assigned"];
  return [];
}

export function areaExtras(area: PermissionArea): BooleanCapability[] {
  return ["canDelete", "canViewAudit", ...(area.fileRelevant ? (["canUploadFiles", "canEditFiles", "canViewFiles"] as const) : [])];
}

export function activeExtrasCount(state: RoleEditorState, area: PermissionArea) {
  return (
    areaExtras(area).filter((capability) => state[capability][area.id]).length +
    (area.supportsAssignedScope && state.shiftsLevel[area.id] && state.shiftsLevel[area.id] !== "none" ? 1 : 0)
  );
}

/** Formularfelder in der Form, die `updateRoleAction`/`createRoleAction` erwarten. */
export function roleEditorFormEntries(state: RoleEditorState): Array<[string, string]> {
  const entries: Array<[string, string]> = [];

  for (const area of permissionAreas) {
    const level = state.permissions[area.id] ?? "none";

    entries.push([`permission-${area.id}`, level]);

    if (level === "none") {
      continue;
    }

    if (areaHasVisibility(area)) {
      entries.push([`scope-${area.id}`, state.scopes[area.id] ?? "all"]);
    }

    for (const capability of areaExtras(area)) {
      if (state[capability][area.id]) {
        entries.push([`${booleanCapabilityFields[capability]}-${area.id}`, "on"]);
      }
    }

    const shiftsLevel = state.shiftsLevel[area.id];

    if (area.supportsAssignedScope && shiftsLevel) {
      entries.push([`shifts-level-${area.id}`, shiftsLevel]);
    }
  }

  return entries;
}

export function levelCounts(permissions: Record<string, PermissionLevel>) {
  const counts = { none: 0, read: 0, write: 0, admin: 0 } satisfies Record<PermissionLevel, number>;

  for (const area of permissionAreas) {
    counts[permissions[area.id] ?? "none"] += 1;
  }

  return counts;
}

export const levelColor: Record<PermissionLevel, string> = {
  none: "#dcdbd6",
  read: "#2c64c9",
  write: "#2f7a4a",
  admin: "#b4332a",
};

/** Segment-Stil je Stufe (aktiver Zustand). */
export const levelSegmentClass: Record<PermissionLevel, string> = {
  none: "border-[#dedad4] bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
  read: "border-[rgba(44,100,201,0.35)] bg-[rgba(44,100,201,0.12)] text-[#2c64c9]",
  write: "border-[rgba(47,122,74,0.35)] bg-[rgba(47,122,74,0.12)] text-[#1f5d2c]",
  admin: "border-[rgba(180,51,42,0.35)] bg-[rgba(180,51,42,0.12)] text-[#b4332a]",
};

export const areaIcons: Record<string, LucideIcon> = {
  employees: UsersRound,
  contracts: BriefcaseBusiness,
  employeeFiles: FileText,
  payroll: Landmark,
  sensitiveData: Shield,
  mutterschutz: Heart,
  locations: MapPin,
  teams: Users,
  files: FileText,
  vacation: Sun,
  sickness: Thermometer,
  shifts: CalendarDays,
  timeTracking: Clock,
  reminders: Bell,
  audit: ScrollText,
  roles: ShieldCheck,
  settings: Settings,
};

/** Vorlagen fürs Anlegen — füllen nur die Rechte-Stufen vor (wie bisher). */
export const roleTemplates: Array<{ id: string; labelKey: string; permissions: Partial<Record<string, PermissionLevel>> }> = [
  {
    id: "location-lead",
    labelKey: "templateLocationLead",
    permissions: {
      employees: "read",
      locations: "write",
      teams: "write",
      files: "read",
      vacation: "write",
      sickness: "read",
      shifts: "admin",
      reminders: "write",
    },
  },
  {
    id: "hr-team",
    labelKey: "templateHrTeam",
    permissions: {
      employees: "write",
      payroll: "read",
      locations: "read",
      teams: "read",
      files: "write",
      vacation: "admin",
      sickness: "write",
      reminders: "write",
      audit: "read",
      roles: "read",
    },
  },
  {
    id: "employee-service",
    labelKey: "templateEmployeeService",
    permissions: {
      employees: "read",
      payroll: "read",
      teams: "read",
      files: "read",
      vacation: "write",
      sickness: "write",
      shifts: "read",
      reminders: "read",
    },
  },
];
