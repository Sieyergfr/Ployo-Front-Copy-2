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
};

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
    const [payroll, contract, sickness] = await Promise.all([
      prisma.tenantPayrollStatement.findUnique({ where: { fileId: file.id }, select: { id: true } }),
      prisma.tenantEmployeeContract.findUnique({ where: { fileId: file.id }, select: { id: true } }),
      prisma.tenantSicknessReport.findFirst({
        where: { attachmentFileId: file.id },
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
  }
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
