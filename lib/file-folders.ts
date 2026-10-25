/**
 * Ordner-Einstellungen der zentralen Ablage (M1): Rollen-Einschränkung und
 * Freigabe für Mitarbeitende. Ohne Datenbankzugriff, damit sich die Regeln
 * direkt testen lassen (Durchsetzung: lib/file-access.ts,
 * lib/shared-files-service.ts).
 *
 * Regeln:
 * - Eine Rollen-Einschränkung gilt für den Ordner, seine Unterordner und alle
 *   Dateien darin. Inhaber/Admin/HR sind nie eingeschränkt.
 * - Eine Freigabe für Mitarbeitende gilt ebenso für Unterordner — außer für
 *   PIN-geschützte oder rollen-eingeschränkte Ordner (die bleiben intern).
 */

export const FILE_FOLDER_ERRORS = {
  notFound: "Ordner nicht gefunden.",
  nameRequired: "Ordnername ist erforderlich.",
  lockedShare: "PIN-geschützte Ordner können nicht für Mitarbeitende freigegeben werden.",
  restrictedShare: "Ordner mit eingeschränkten Rollen können nicht für Mitarbeitende freigegeben werden.",
  sameFolder: "Die Datei liegt bereits in diesem Ordner.",
} as const;

export type FolderAclRow = {
  path: string;
  accessRoleIdsJson: unknown;
};

export type FolderShareRow = FolderAclRow & {
  id: string;
  name: string;
  locked: boolean;
  sharedWithEmployees: boolean;
  visibleTeamIdsJson: unknown;
  visibleLocationIdsJson: unknown;
};

export type FolderViewer = {
  membershipRole: string;
  roleId?: string | null;
};

export function parseIdList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

/** "a/b/c" → ["a", "a/b", "a/b/c"]; leerer Pfad (Wurzel) → []. */
export function folderPathChain(path: string): string[] {
  const parts = path.split("/").filter(Boolean);

  return parts.map((_part, index) => parts.slice(0, index + 1).join("/"));
}

export function isFolderManager(viewer: FolderViewer) {
  return ["OWNER", "ADMIN", "HR"].includes(viewer.membershipRole);
}

/** Ist ein Pfad (Ordner oder Ordner einer Datei) für diesen Betrachter durch eine Rollen-Einschränkung gesperrt? */
export function isFolderPathDenied(folders: FolderAclRow[], path: string, viewer: FolderViewer) {
  if (isFolderManager(viewer) || !path) {
    return false;
  }

  const chain = new Set(folderPathChain(path));

  return folders.some((folder) => {
    if (!chain.has(folder.path)) return false;

    const roleIds = parseIdList(folder.accessRoleIdsJson);

    return roleIds.length > 0 && !(viewer.roleId && roleIds.includes(viewer.roleId));
  });
}

export type EmployeeAudience = {
  teamIds: string[];
  locationIds: string[];
};

/** Erreicht die Freigabe eines Ordners diese Person (alle bzw. passendes Team/Standort)? */
export function folderShareMatches(folder: FolderShareRow, audience: EmployeeAudience) {
  if (!folder.sharedWithEmployees) return false;

  const teamIds = parseIdList(folder.visibleTeamIdsJson);
  const locationIds = parseIdList(folder.visibleLocationIdsJson);

  if (teamIds.length === 0 && locationIds.length === 0) return true;

  return (
    teamIds.some((id) => audience.teamIds.includes(id)) || locationIds.some((id) => audience.locationIds.includes(id))
  );
}

/**
 * Ordner, die für diese Person freigegeben sind: Ein Ordner ist sichtbar,
 * wenn er selbst oder ein Elternordner für sie freigegeben ist und weder er
 * noch ein Elternordner PIN-geschützt oder rollen-eingeschränkt ist.
 */
export function sharedFolderPaths(folders: FolderShareRow[], audience: EmployeeAudience) {
  const byPath = new Map(folders.map((folder) => [folder.path, folder]));
  const visible = new Set<string>();

  for (const folder of folders) {
    const chain = folderPathChain(folder.path).map((path) => byPath.get(path));

    if (chain.some((entry) => !entry)) continue;

    const blocked = chain.some((entry) => entry!.locked || parseIdList(entry!.accessRoleIdsJson).length > 0);

    if (blocked) continue;

    if (chain.some((entry) => folderShareMatches(entry!, audience))) {
      visible.add(folder.path);
    }
  }

  return visible;
}
