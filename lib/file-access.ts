import {
  assertEmployeeInScope,
  requireTenantAccess,
  resolveScopeFilter,
  type TenantAccess,
  type TenantPermissionArea,
} from "@/lib/tenant-access";

export type FileAclRecord = {
  accessRoleIdsJson: unknown;
  accessUserIdsJson: unknown;
};

function parseIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function canAccessFileAcl(file: FileAclRecord, access: TenantAccess) {
  if (["OWNER", "ADMIN", "HR"].includes(access.membershipRole)) return true;

  const roleIds = parseIds(file.accessRoleIdsJson);
  const userIds = parseIds(file.accessUserIdsJson);
  if (roleIds.length === 0 && userIds.length === 0) return true;

  return userIds.includes(access.userId) || Boolean(access.roleId && roleIds.includes(access.roleId));
}

export function requireFileAcl(file: FileAclRecord, access: TenantAccess) {
  if (!canAccessFileAcl(file, access)) throw new Error("FORBIDDEN");
}

export async function getOptionalFileReadAccess(tenantSlug: string) {
  try {
    return await requireTenantAccess(tenantSlug, "files", "read");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return null;
    throw error;
  }
}

export type TenantFileAreaRecord = {
  id: string;
  employeeId: string | null;
  locationId: string | null;
  teamId: string | null;
  hiddenFromEmployee: boolean;
  /** Zur Auflösung des ganzen Versionenverbunds (Audit-Finding H07) — fehlt sie, wird nur `id` selbst betrachtet. */
  parentId?: string | null;
  /** Nur für zentrale Dateien (employeeId/locationId/teamId alle null) relevant — Uploader-Scope. */
  uploadedById?: string;
  accessRoleIdsJson?: unknown;
  accessUserIdsJson?: unknown;
};

function isExplicitlySharedWithMe(
  file: { accessRoleIdsJson?: unknown; accessUserIdsJson?: unknown },
  access: TenantAccess,
) {
  const roleIds = parseIds(file.accessRoleIdsJson);
  const userIds = parseIds(file.accessUserIdsJson);
  return userIds.includes(access.userId) || Boolean(access.roleId && roleIds.includes(access.roleId));
}

/**
 * Bereichsspezifische Zweitprüfung für die generischen Datei-Ausgabe-Pfade
 * (`getTenantFileSignedUrl`, `getTenantFileContentForUser`). Die reine
 * "files:read"-Berechtigung plus ACL (`requireFileAcl`) sagt nichts über den
 * fachlichen Bereich einer Datei aus — eine Rolle mit "files: read" aber
 * ohne (ausreichenden) Zugriff auf "payroll"/"contracts"/"sickness"/
 * "employeeFiles" konnte darüber bislang trotzdem jede Personalakten-Datei jedes Mitarbeiters
 * abrufen, sobald die Datei-ID bekannt war. Spiegelt für den rollenbasierten
 * Pfad, was `getMyDocumentDownloadUrl` (lib/self-service.ts) bereits für den
 * Self-Service-Pfad tut: Ziel-Bereich inkl. Scope sowie `hiddenFromEmployee`
 * prüfen, statt sich auf die generische Datei-ACL zu verlassen.
 *
 * Tenant-Manager (OWNER/ADMIN/HR) umgehen wie bei `canAccessFileAcl` jede
 * weitere Prüfung — sie sind ohnehin bereichsübergreifend berechtigt.
 */
export async function requireTenantFileAreaAccess(
  fileAccess: TenantAccess,
  file: TenantFileAreaRecord,
) {
  if (["OWNER", "ADMIN", "HR"].includes(fileAccess.membershipRole)) return;

  const { prisma } = await import("@/lib/prisma");

  if (file.employeeId) {
    // Die Vertrags-/Abrechnungs-/Krankheits-FK zeigt immer nur auf EINE
    // konkrete Version (die aktuell aktive), nicht auf den ganzen
    // Versionenverbund. Ohne die anderen Versionen (Wurzeldokument + ältere,
    // "replaced" Stände) einzubeziehen, verliert eine bereits ersetzte, aber
    // weiterhin abrufbare alte Version ihre eigentliche Fachkategorie und
    // fällt auf das allgemeinere "employeeFiles" zurück — ebenso eine neue
    // Version, deren FK (noch) nicht umgehängt wurde (Audit-Finding H07).
    const rootId = file.parentId ?? file.id;
    const family = await prisma.tenantFile.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      select: { id: true },
    });
    const familyIds = family.length > 0 ? family.map((entry) => entry.id) : [file.id];

    const [payroll, contract, sickness] = await Promise.all([
      prisma.tenantPayrollStatement.findFirst({ where: { fileId: { in: familyIds } }, select: { id: true } }),
      prisma.tenantEmployeeContract.findFirst({ where: { fileId: { in: familyIds } }, select: { id: true } }),
      prisma.tenantSicknessReport.findFirst({
        where: { attachmentFileId: { in: familyIds } },
        select: { id: true },
      }),
    ]);
    const area: TenantPermissionArea = payroll
      ? "payroll"
      : contract
        ? "contracts"
        : sickness
          ? "sickness"
          : "employeeFiles";

    const areaAccess = await requireTenantAccess(fileAccess.tenantSlug, area, "read");

    // "sickness" hat weiterhin ein eigenes, vom Level getrenntes
    // Datei-Sichtbarkeits-Flag (siehe PermissionArea.fileRelevant) — für
    // "payroll"/"contracts"/"employeeFiles" reicht das Level selbst (wie
    // beim eigenständigen "files"-Modul), `requireTenantAccess` hat das
    // oben bereits durchgesetzt.
    if (area === "sickness" && !areaAccess.canViewFiles) throw new Error("FORBIDDEN");
    await assertEmployeeInScope(areaAccess, file.employeeId);

    if (file.hiddenFromEmployee) {
      const own = await prisma.tenantEmployee.findFirst({
        where: { tenantId: fileAccess.tenantId, userId: fileAccess.userId },
        select: { id: true },
      });
      if (own?.id === file.employeeId) throw new Error("FORBIDDEN");
    }
    return;
  }

  if (file.locationId) {
    const areaAccess = await requireTenantAccess(fileAccess.tenantSlug, "locations", "read");
    if (!areaAccess.canViewFiles) throw new Error("FORBIDDEN");

    const scopeFilter = await resolveScopeFilter(areaAccess);
    if (scopeFilter.type === "assigned" && scopeFilter.area === "locations") {
      const location = await prisma.tenantLocation.findUnique({
        where: { id: file.locationId },
        select: { name: true },
      });
      if (!location || !scopeFilter.locationNames.includes(location.name)) {
        throw new Error("FORBIDDEN");
      }
    }
    return;
  }

  if (file.teamId) {
    const areaAccess = await requireTenantAccess(fileAccess.tenantSlug, "teams", "read");
    if (!areaAccess.canViewFiles) throw new Error("FORBIDDEN");

    const scopeFilter = await resolveScopeFilter(areaAccess);
    if (scopeFilter.type === "assigned" && scopeFilter.area === "teams" && !scopeFilter.teamIds.includes(file.teamId)) {
      throw new Error("FORBIDDEN");
    }
    return;
  }

  // Zentrale Datei (employeeId/locationId/teamId alle null): hier gilt der
  // "files"-Scope selbst als Uploader-Scope — "own"/"team" darf nur
  // Mutationen an selbst- bzw. vom eigenen Team hochgeladenen Dateien
  // erlauben. Leselisten (`filesUploaderScopeWhere` in files-server.ts)
  // filterten das bereits; über eine bekannte Datei-ID kam eine Mutation
  // (neue Version, Löschen, Sichtbarkeit) bisher trotzdem durch
  // (Audit-Finding H06). Eine ausdrückliche Freigabe (ACL) hebt den
  // Uploader-Scope für genau diese Datei auf, analog zu `filesVisibilityWhere`.
  if (isExplicitlySharedWithMe(file, fileAccess)) return;

  const scopeFilter = await resolveScopeFilter(fileAccess);

  if (scopeFilter.type === "all") return;

  if (scopeFilter.type === "own") {
    if (file.uploadedById !== fileAccess.userId) throw new Error("FORBIDDEN");
    return;
  }

  if (scopeFilter.type === "team") {
    const uploader = file.uploadedById
      ? await prisma.tenantEmployee.findFirst({
          where: { tenantId: fileAccess.tenantId, userId: file.uploadedById },
          select: { id: true },
        })
      : null;

    if (!uploader || !scopeFilter.teammateIds.includes(uploader.id)) throw new Error("FORBIDDEN");
    return;
  }

  // "files" unterstützt (bisher) keinen "assigned"-Scope — sollte er dennoch
  // auftreten, sicherheitshalber verweigern statt stillschweigend zuzulassen.
  throw new Error("FORBIDDEN");
}

/**
 * Wie `getOptionalFileReadAccess`, aber für Dokumente, die an einen
 * Fachbereich statt an das eigenständige Dateien-Modul gebunden sind
 * (Personalakte-Dokumente, Standort-Dokumente, ...) — prüft `canViewFiles`
 * des jeweiligen Bereichs statt des globalen `files`-Levels. `null` bedeutet
 * "keine Datei aus diesem Bereich anzeigen", nicht "alle anzeigen".
 */
export async function getOptionalAreaFileAccess(
  tenantSlug: string,
  area: TenantPermissionArea,
) {
  try {
    const access = await requireTenantAccess(tenantSlug, area, "read");

    return access.canViewFiles ? access : null;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return null;
    throw error;
  }
}
