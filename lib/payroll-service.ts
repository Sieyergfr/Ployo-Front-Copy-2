import { recordTenantAudit } from "@/lib/audit";
import { decryptField, encryptField } from "@/lib/encryption";
import { canAccessFileAcl, getOptionalFileReadAccess } from "@/lib/file-access";
import { prisma } from "@/lib/prisma";
import { uploadTenantFile } from "@/lib/storage/storage.service";
import { assertEmployeeInScope, requireTenantAccess, resolveScopeFilter } from "@/lib/tenant-access";

/**
 * Gleiche Berechtigungsebene wie Verträge (siehe contract-service.ts) —
 * es gibt keinen eigenen "payroll:write"-Gate für Dateien, `uploadTenantFile`
 * prüft zusätzlich "files:write".
 */
async function requirePayrollAccess(tenantSlug: string) {
  return requireTenantAccess(tenantSlug, "payroll", "write");
}

/**
 * Antwortform der API-Liste. Bewusst nicht der Prisma-Datensatz: der zieht
 * über `file` den kompletten Storage-Eintrag inkl. `bucket`/`storageKey` mit,
 * und die Mobile-App braucht nur Anzeige- plus Download-Daten.
 */
export type PayrollStatementListItem = {
  id: string;
  period: string;
  /** `YYYY-MM-DD` */
  issuedAt: string;
  gross: string;
  net: string;
  status: "available" | "corrected";
  /** Verweis auf die Datei im Dateien-Modul — für `/files/[fileId]/signed-url`. */
  fileId: string;
  fileName: string;
  createdAt: string;
};

/**
 * Abrechnungen eines Mitarbeiters. Gleiche Berechtigungsebene wie die
 * Verträge (`payroll:read` inkl. Scope, siehe contract-service.ts) plus die
 * Datei-ACL — sonst stünde in der Liste ein Download, den
 * `/files/[fileId]/signed-url` anschließend mit `403` verweigert.
 *
 * `employeeId` akzeptiert `key` und DB-`id` (wie bei den Verträgen).
 */
export async function getPayrollStatements(
  tenantSlug: string,
  employeeId: string,
): Promise<PayrollStatementListItem[]> {
  const access = await requireTenantAccess(tenantSlug, "payroll", "read");
  const scopeFilter = await resolveScopeFilter(access);
  const scopeConstraint =
    scopeFilter.type === "own"
      ? { id: scopeFilter.employeeId ?? "__none__" }
      : scopeFilter.type === "team"
        ? { team: scopeFilter.team }
        : {};
  const fileAccess = await getOptionalFileReadAccess(tenantSlug);

  if (!fileAccess) {
    return [];
  }

  const statements = await prisma.tenantPayrollStatement.findMany({
    where: {
      tenantId: access.tenantId,
      employee: { OR: [{ id: employeeId }, { key: employeeId }], ...scopeConstraint },
    },
    include: {
      file: {
        include: { parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } } },
      },
    },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
  });

  return statements
    .filter((statement) => canAccessFileAcl(statement.file.parent ?? statement.file, fileAccess))
    .map((statement) => ({
      id: statement.id,
      period: statement.period,
      issuedAt: statement.issuedAt.toISOString().slice(0, 10),
      gross: decryptField(statement.gross),
      net: decryptField(statement.net),
      status: statement.status === "corrected" ? "corrected" : "available",
      fileId: statement.fileId,
      fileName: statement.file.displayName || statement.file.originalName,
      createdAt: statement.createdAt.toISOString(),
    }));
}

export async function uploadPayrollStatement(input: {
  tenantSlug: string;
  employeeId: string;
  file: File;
  period: string;
  gross: string;
  net: string;
}) {
  const access = await requirePayrollAccess(input.tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: {
      tenantId: access.tenantId,
      OR: [{ id: input.employeeId }, { key: input.employeeId }],
    },
    select: { id: true, name: true },
  });

  if (!employee) {
    throw new Error("Mitarbeiter wurde nicht gefunden.");
  }

  await assertEmployeeInScope(access, employee.id);

  if (
    input.file.type !== "application/pdf" &&
    !input.file.name.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error("Gehaltsabrechnungen benötigen eine PDF-Datei.");
  }

  const period = input.period.trim();

  if (!period) {
    throw new Error("Bitte einen Abrechnungszeitraum angeben (z. B. \"Januar 2026\").");
  }

  const storedFile = await uploadTenantFile({
    tenantSlug: input.tenantSlug,
    file: input.file,
    ownerType: "employee",
    ownerId: employee.id,
    folderSlug: "abrechnungen",
    folderName: "Abrechnungen",
    ownerName: "HR",
    documentType: "Gehaltsabrechnung",
    description: period,
    assignedEmployeeId: employee.id,
    tags: ["Abrechnung"],
  });

  const grossPlain = input.gross.trim();
  const netPlain = input.net.trim();
  const statement = await prisma.tenantPayrollStatement.create({
    data: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      fileId: storedFile.id,
      period,
      gross: encryptField(grossPlain),
      net: encryptField(netPlain),
      status: "available",
    },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Gehaltsabrechnung hochgeladen",
    source: "Personalakte",
    entityType: "payroll",
    entityId: statement.id,
    detail: `${employee.name} · ${period}`,
  });

  // Gleiche Form wie die Liste oben — sonst bekäme derselbe Client für dieselbe
  // Ressource zwei Formen (und mit dem Roh-Datensatz auch `storageKey`).
  return {
    id: statement.id,
    period: statement.period,
    issuedAt: statement.issuedAt.toISOString().slice(0, 10),
    gross: grossPlain,
    net: netPlain,
    status: statement.status === "corrected" ? "corrected" : "available",
    fileId: statement.fileId,
    fileName: storedFile.displayName || storedFile.originalName,
    createdAt: statement.createdAt.toISOString(),
  } satisfies PayrollStatementListItem;
}
