import "server-only";
import {
  permissionAreas,
  permissionLevels,
  permissionScopes,
  type PermissionLevel,
  type PermissionScope,
} from "@/lib/roles";

const areaIds = permissionAreas.map((area) => area.id);

function isLevel(value: unknown): value is PermissionLevel {
  return typeof value === "string" && (permissionLevels as readonly string[]).includes(value);
}

function isScope(value: unknown): value is PermissionScope {
  return typeof value === "string" && (permissionScopes as readonly string[]).includes(value);
}

/**
 * Sanitisiert die Berechtigungs-Payload einer Rolle aus einem JSON-Body —
 * dasselbe Feld-pro-Bereich-Schema, das `role-service.ts` intern aus
 * FormData liest (`permissionsFromFormData` & Co.), nur JSON-tauglich.
 * Unbekannte Bereichs-Keys werden ignoriert, ungültige Werte fallen weg
 * (die Service-Funktion füllt fehlende Bereiche selbst mit den Defaults
 * none/all/false auf).
 */
export function parseRolePermissions(body: Record<string, unknown>) {
  const permissions: Record<string, PermissionLevel> = {};
  const scopes: Record<string, PermissionScope> = {};
  const canDelete: Record<string, boolean> = {};
  const canUploadFiles: Record<string, boolean> = {};
  const canEditFiles: Record<string, boolean> = {};
  const canViewFiles: Record<string, boolean> = {};
  const canViewAudit: Record<string, boolean> = {};
  const shiftsLevel: Record<string, PermissionLevel | null> = {};

  const permissionsInput = (body.permissions ?? {}) as Record<string, unknown>;
  const scopesInput = (body.scopes ?? {}) as Record<string, unknown>;
  const canDeleteInput = (body.canDelete ?? {}) as Record<string, unknown>;
  const canUploadFilesInput = (body.canUploadFiles ?? {}) as Record<string, unknown>;
  const canEditFilesInput = (body.canEditFiles ?? {}) as Record<string, unknown>;
  const canViewFilesInput = (body.canViewFiles ?? {}) as Record<string, unknown>;
  const canViewAuditInput = (body.canViewAudit ?? {}) as Record<string, unknown>;
  const shiftsLevelInput = (body.shiftsLevel ?? {}) as Record<string, unknown>;

  for (const areaId of areaIds) {
    if (isLevel(permissionsInput[areaId])) {
      permissions[areaId] = permissionsInput[areaId] as PermissionLevel;
    }

    if (isScope(scopesInput[areaId])) {
      scopes[areaId] = scopesInput[areaId] as PermissionScope;
    }

    if (typeof canDeleteInput[areaId] === "boolean") {
      canDelete[areaId] = canDeleteInput[areaId] as boolean;
    }

    if (typeof canUploadFilesInput[areaId] === "boolean") {
      canUploadFiles[areaId] = canUploadFilesInput[areaId] as boolean;
    }

    if (typeof canEditFilesInput[areaId] === "boolean") {
      canEditFiles[areaId] = canEditFilesInput[areaId] as boolean;
    }

    if (typeof canViewFilesInput[areaId] === "boolean") {
      canViewFiles[areaId] = canViewFilesInput[areaId] as boolean;
    }

    if (typeof canViewAuditInput[areaId] === "boolean") {
      canViewAudit[areaId] = canViewAuditInput[areaId] as boolean;
    }

    if (isLevel(shiftsLevelInput[areaId])) {
      shiftsLevel[areaId] = shiftsLevelInput[areaId] as PermissionLevel;
    }
  }

  return {
    appOverviewEnabled:
      typeof body.appOverviewEnabled === "boolean" ? body.appOverviewEnabled : undefined,
    permissions,
    scopes,
    canDelete,
    canUploadFiles,
    canEditFiles,
    canViewFiles,
    canViewAudit,
    shiftsLevel,
  };
}
