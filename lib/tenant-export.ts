import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { recordTenantAudit } from "@/lib/audit";
import { decryptAddress } from "@/lib/employee-address";
import { decryptField } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { requireSettingsManager } from "@/lib/settings-service";
import {
  getOptionalTenantAccess,
  resolveScopeFilter,
  scopeAllowsTarget,
  type ScopeFilter,
  type TenantPermissionArea,
} from "@/lib/tenant-access";

/** Wie in employee-service.ts — Platzhalter für ohne Fachrecht ausgeblendete Werte. */
const REDACTED = "•••";

/**
 * Löst für einen Fachbereich (Audit-Finding H02/R03) auf, ob und mit
 * welchem Scope der Aufrufer lesen darf. `null` heißt: kein Leserecht,
 * Bereich vollständig ausblenden — wie zuvor. Anders als die alte
 * `Boolean(...)`-Prüfung wird der konkrete Scope (own/team/all) aber nicht
 * mehr verworfen: `own`/`team` darf im Export nicht mehr ergeben als in den
 * normalen, scope-geprüften Lesewegen.
 */
async function resolveExportScope(
  tenantSlug: string,
  area: TenantPermissionArea,
): Promise<ScopeFilter | null> {
  const access = await getOptionalTenantAccess(tenantSlug, area, "read");
  if (!access) return null;
  return resolveScopeFilter(access);
}

/** true, wenn der aufgelöste Scope einen Datensatz mit dieser employeeId einschließt. */
function scopeIncludesEmployee(
  scope: ScopeFilter | null,
  employeeId: string | null | undefined,
  employeesById: Map<string, { id: string }>,
): boolean {
  if (!scope) return false;
  if (scope.type === "all") return true;
  if (!employeeId) return false;
  const target = employeesById.get(employeeId);
  if (!target) return false;
  return scopeAllowsTarget(scope, target);
}

/**
 * Vollständiger Mandanten-Export für AGB §6 ("Datensicherung und
 * Datenherausgabe"). Anders als /api/me/export (nur eigenes Konto) liefert
 * dieser Export alle Personaldaten, die der Mandant selbst verwaltet.
 * Dateiinhalte (S3) werden bewusst nicht eingebettet — nur Metadaten, die
 * Originaldateien bleiben über den Dateien-Bereich einzeln abrufbar.
 */
export async function buildTenantExport(tenantSlug: string) {
  // DSGVO-Datenexport bleibt auch bei Abo-Sperre möglich.
  const access = await requireSettingsManager(tenantSlug, { allowBillingBlocked: true });
  const tenantId = access.tenantId;

  // "settings:write" allein ist keine Berechtigung für sensible Stammdaten,
  // Verträge, Abrechnungen, Krankheits-, Urlaubs-, Schicht- oder Dateidaten —
  // der Voll-Export darf davon nicht mehr offenlegen, als der Aufrufer über
  // die jeweilige Fachrolle ohnehin einsehen dürfte, UND nicht mehr, als der
  // dort konkret gewährte Scope (own/team/all) erlaubt (Audit-Finding
  // H02/R03 — vorher wurde ein own/team-Scope wie "all" behandelt).
  const sensitiveDataScope = await resolveExportScope(tenantSlug, "sensitiveData");
  const contractsScope = await resolveExportScope(tenantSlug, "contracts");
  const payrollScope = await resolveExportScope(tenantSlug, "payroll");
  const sicknessScope = await resolveExportScope(tenantSlug, "sickness");
  const mutterschutzScope = await resolveExportScope(tenantSlug, "mutterschutz");
  const vacationScope = await resolveExportScope(tenantSlug, "vacation");
  const shiftsScope = await resolveExportScope(tenantSlug, "shifts");
  const filesScope = await resolveExportScope(tenantSlug, "files");
  const timeTrackingScope = await resolveExportScope(tenantSlug, "timeTracking");

  const [
    tenant,
    employees,
    contracts,
    contractDetails,
    teams,
    locations,
    vacationRequests,
    wishFreeRequests,
    sicknessReports,
    shifts,
    shiftTemplates,
    reminders,
    roles,
    files,
    payrollStatements,
    timeEntries,
  ] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        slug: true,
        country: true,
        timezone: true,
        size: true,
        industry: true,
        contactEmail: true,
        plan: true,
        billingCycle: true,
        createdAt: true,
        settings: {
          select: {
            taxId: true,
            weekStart: true,
            workHours: true,
            vacationDays: true,
            companyAddress: true,
          },
        },
      },
    }),
    prisma.tenantEmployee.findMany({
      where: { tenantId },
      include: { privateAddress: true, workAddress: true },
    }),
    prisma.tenantEmployeeContract.findMany({ where: { tenantId } }),
    prisma.tenantEmployeeContractDetails.findMany({ where: { tenantId } }),
    prisma.tenantTeam.findMany({ where: { tenantId }, include: { members: true } }),
    prisma.tenantLocation.findMany({
      where: { tenantId },
      include: { address: true, members: true },
    }),
    prisma.tenantVacationRequest.findMany({ where: { tenantId } }),
    prisma.tenantWishFreeRequest.findMany({ where: { tenantId } }),
    prisma.tenantSicknessReport.findMany({ where: { tenantId } }),
    prisma.tenantShift.findMany({ where: { tenantId } }),
    prisma.tenantShiftTemplate.findMany({ where: { tenantId } }),
    prisma.tenantReminder.findMany({ where: { tenantId } }),
    prisma.tenantRole.findMany({ where: { tenantId }, include: { permissions: true } }),
    prisma.tenantFile.findMany({
      where: { tenantId, status: "active" },
      select: {
        id: true,
        originalName: true,
        displayName: true,
        mimeType: true,
        sizeBytes: true,
        folderName: true,
        documentType: true,
        employeeId: true,
        locationId: true,
        teamId: true,
        uploadedByName: true,
        createdAt: true,
      },
    }),
    prisma.tenantPayrollStatement.findMany({ where: { tenantId } }),
    timeTrackingScope
      ? prisma.tenantTimeEntry.findMany({
          where: { tenantId },
          include: { breaks: { orderBy: { startAt: "asc" } } },
          orderBy: { clockInAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const session = await auth.api.getSession({ headers: await headers() });

  await recordTenantAudit({
    tenantId,
    actorId: access.userId,
    actorName: session?.user?.name || session?.user?.email || "System",
    action: "Vollständiger Mandanten-Export heruntergeladen",
    source: "Einstellungen",
    entityType: "tenant-export",
    entityId: tenantId,
    detail: `${employees.length} Mitarbeiter, ${files.length} Dateien, ${payrollStatements.length} Abrechnungen`,
  });

  const employeesById = new Map(employees.map((employee) => [employee.id, { id: employee.id }]));

  // "own"/"team" bei Schichten lässt sich direkt über die auf der Schicht
  // gespeicherte employeeId auflösen, ohne Umweg über `employeesById` —
  // "team" wie in `shiftScopeWhere` (shift-service.ts) über die Kolleg:innen.
  function shiftAllowed(shift: { employeeId: string | null }): boolean {
    if (!shiftsScope) return false;
    if (shiftsScope.type === "all") return true;
    if (shiftsScope.type === "own") {
      return shift.employeeId != null && shift.employeeId === shiftsScope.employeeId;
    }
    if (shiftsScope.type === "team") {
      return shift.employeeId != null && shiftsScope.teammateIds.includes(shift.employeeId);
    }
    return false;
  }

  // Dateien hängen an Mitarbeiter, Team ODER Standort — "own"/"team" darf nur
  // die jeweils zugehörige Teilmenge einschließen, rein zentrale bzw.
  // standortgebundene Dateien bleiben ohne "all"-Scope außen vor.
  function fileAllowed(file: {
    employeeId: string | null;
    locationId: string | null;
    teamId: string | null;
  }): boolean {
    if (!filesScope) return false;
    if (filesScope.type === "all") return true;
    if (filesScope.type === "own") {
      return file.employeeId != null && file.employeeId === filesScope.employeeId;
    }
    if (filesScope.type === "team") {
      if (file.employeeId) {
        return filesScope.teammateIds.includes(file.employeeId);
      }
      if (file.teamId) {
        return filesScope.teamIds.includes(file.teamId);
      }
      return false;
    }
    return false;
  }

  // App-seitig verschlüsselte Felder (lib/encryption.ts) kämen hier sonst als
  // "enc:v1:..."-Chiffretext statt als tatsächliche Daten an — für einen
  // Datenherausgabe-Export (AGB §6) muss das entschlüsselt sein. Jedes Feld
  // wird PRO MITARBEITER anhand des aufgelösten Scopes freigegeben statt
  // tenantweit per einzelner Boolean-Prüfung (Audit-Finding H02/R03).
  const decryptedEmployees = employees.map((employee) => {
    const canViewSensitive = scopeIncludesEmployee(sensitiveDataScope, employee.id, employeesById);
    const canViewMutterschutz = scopeIncludesEmployee(mutterschutzScope, employee.id, employeesById);
    const decryptedEmergencyContacts = decryptField(employee.emergencyContactsJson);
    let emergencyContacts: unknown = [];

    try {
      emergencyContacts = decryptedEmergencyContacts ? JSON.parse(decryptedEmergencyContacts) : [];
    } catch {
      emergencyContacts = [];
    }

    return {
      ...employee,
      taxId: canViewSensitive ? decryptField(employee.taxId) : REDACTED,
      socialSecurityNumber: canViewSensitive
        ? decryptField(employee.socialSecurityNumber)
        : REDACTED,
      healthInsurance: canViewSensitive ? decryptField(employee.healthInsurance) : REDACTED,
      iban: canViewSensitive ? decryptField(employee.iban) : REDACTED,
      birthDate: canViewSensitive ? decryptField(employee.birthDate) : REDACTED,
      birthPlace: canViewSensitive ? decryptField(employee.birthPlace) : REDACTED,
      nationality: canViewSensitive ? decryptField(employee.nationality) : REDACTED,
      maritalStatus: canViewSensitive ? decryptField(employee.maritalStatus) : REDACTED,
      // Vorher unconditional ausgegeben, unabhängig von jeder Fachberechtigung.
      emergencyContactsJson: canViewSensitive ? emergencyContacts : [],
      privateAddress: canViewSensitive ? decryptAddress(employee.privateAddress) : null,
      workAddress: decryptAddress(employee.workAddress),
      maternityProtectionActive: canViewMutterschutz ? employee.maternityProtectionActive : null,
      maternityProtectionNote: canViewMutterschutz
        ? decryptField(employee.maternityProtectionNote)
        : REDACTED,
    };
  });
  const decryptedContracts = contracts
    .filter((contract) => scopeIncludesEmployee(contractsScope, contract.employeeId, employeesById))
    .map((contract) => ({
      ...contract,
      compensation: decryptField(contract.compensation),
    }));
  const decryptedContractDetails = contractDetails
    .filter((detail) => scopeIncludesEmployee(contractsScope, detail.employeeId, employeesById))
    .map((detail) => ({
      ...detail,
      compensation: decryptField(detail.compensation),
      compensationGross: decryptField(detail.compensationGross),
    }));
  const decryptedSicknessReports = sicknessReports
    .filter((report) => scopeIncludesEmployee(sicknessScope, report.employeeId, employeesById))
    .map((report) => ({
      ...report,
      note: decryptField(report.note),
    }));
  const decryptedPayrollStatements = payrollStatements
    .filter((statement) => scopeIncludesEmployee(payrollScope, statement.employeeId, employeesById))
    .map((statement) => ({
      ...statement,
      gross: decryptField(statement.gross),
      net: decryptField(statement.net),
    }));
  const scopedVacationRequests = vacationRequests.filter((request) =>
    scopeIncludesEmployee(vacationScope, request.employeeId, employeesById),
  );
  const scopedWishFreeRequests = wishFreeRequests.filter((request) =>
    scopeIncludesEmployee(vacationScope, request.employeeId, employeesById),
  );
  const scopedShifts = shifts.filter(shiftAllowed);
  const scopedFiles = files.filter(fileAllowed);
  const scopedTimeEntries = timeEntries.filter((entry) =>
    scopeIncludesEmployee(timeTrackingScope, entry.employeeId, employeesById),
  );

  const scopeLabel = (scope: ScopeFilter | null) => {
    if (!scope) return null;
    if (scope.type === "all") return null;
    if (scope.type === "own") return "nur eigene Daten";
    if (scope.type === "team") return "nur Team-Daten";
    return "nur zugewiesene Daten";
  };

  const redactedAreas = (
    [
      ["sensible Stammdaten (Geburtsdaten, Steuer-ID, SV-Nummer, Krankenkasse, IBAN, Privatadresse, Notfallkontakte)", sensitiveDataScope],
      ["Mutterschutz-Kennzeichnung", mutterschutzScope],
      ["Vertragsdaten", contractsScope],
      ["Gehaltsabrechnungen", payrollScope],
      ["Krankmeldungen", sicknessScope],
      ["Urlaubs-/Wunschfrei-Anträge", vacationScope],
      ["Schichten", shiftsScope],
      ["Zeiterfassung", timeTrackingScope],
      ["Dateimetadaten", filesScope],
    ] as const
  ).map(([label, scope]) => {
    if (!scope) return `${label} (keine Berechtigung)`;
    const partial = scopeLabel(scope);
    return partial ? `${label} (${partial})` : null;
  }).filter((entry): entry is string => Boolean(entry));

  return {
    exportedAt: new Date().toISOString(),
    tenant,
    employees: decryptedEmployees,
    contracts: decryptedContracts,
    contractDetails: decryptedContractDetails,
    teams,
    locations,
    vacationRequests: scopedVacationRequests,
    wishFreeRequests: scopedWishFreeRequests,
    sicknessReports: decryptedSicknessReports,
    shifts: scopedShifts,
    shiftTemplates,
    reminders,
    roles,
    files: scopedFiles,
    payrollStatements: decryptedPayrollStatements,
    timeEntries: scopedTimeEntries,
    hinweis:
      "Dateiinhalte (Dokumente) sind nicht eingebettet — die Originale stehen einzeln im Dateien-Bereich zum Download bereit. Audit-Protokolle unterliegen der in den Einstellungen konfigurierten Aufbewahrungsfrist und sind nicht Teil dieses Exports." +
      (redactedAreas.length
        ? ` Wegen fehlender oder eingeschränkter Fachberechtigung ausgeblendet oder eingeschränkt: ${redactedAreas.join(", ")}.`
        : ""),
  };
}
