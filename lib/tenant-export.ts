import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { recordTenantAudit } from "@/lib/audit";
import { decryptAddress } from "@/lib/employee-address";
import { decryptField } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { requireSettingsManager } from "@/lib/settings-service";

/**
 * Vollständiger Mandanten-Export für AGB §6 ("Datensicherung und
 * Datenherausgabe"). Anders als /api/me/export (nur eigenes Konto) liefert
 * dieser Export alle Personaldaten, die der Mandant selbst verwaltet.
 * Dateiinhalte (S3) werden bewusst nicht eingebettet — nur Metadaten, die
 * Originaldateien bleiben über den Dateien-Bereich einzeln abrufbar.
 */
export async function buildTenantExport(tenantSlug: string) {
  const access = await requireSettingsManager(tenantSlug);
  const tenantId = access.tenantId;

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

  // App-seitig verschlüsselte Felder (lib/encryption.ts) kämen hier sonst als
  // "enc:v1:..."-Chiffretext statt als tatsächliche Daten an — für einen
  // Datenherausgabe-Export (AGB §6) muss das entschlüsselt sein.
  const decryptedEmployees = employees.map((employee) => {
    const decryptedEmergencyContacts = decryptField(employee.emergencyContactsJson);
    let emergencyContacts: unknown = [];

    try {
      emergencyContacts = decryptedEmergencyContacts ? JSON.parse(decryptedEmergencyContacts) : [];
    } catch {
      emergencyContacts = [];
    }

    return {
      ...employee,
      taxId: decryptField(employee.taxId),
      socialSecurityNumber: decryptField(employee.socialSecurityNumber),
      healthInsurance: decryptField(employee.healthInsurance),
      iban: decryptField(employee.iban),
      birthDate: decryptField(employee.birthDate),
      birthPlace: decryptField(employee.birthPlace),
      nationality: decryptField(employee.nationality),
      maritalStatus: decryptField(employee.maritalStatus),
      emergencyContactsJson: emergencyContacts,
      privateAddress: decryptAddress(employee.privateAddress),
      workAddress: decryptAddress(employee.workAddress),
    };
  });
  const decryptedContractDetails = contractDetails.map((detail) => ({
    ...detail,
    compensation: decryptField(detail.compensation),
    compensationGross: decryptField(detail.compensationGross),
  }));
  const decryptedSicknessReports = sicknessReports.map((report) => ({
    ...report,
    note: decryptField(report.note),
  }));
  const decryptedPayrollStatements = payrollStatements.map((statement) => ({
    ...statement,
    gross: decryptField(statement.gross),
    net: decryptField(statement.net),
  }));

  return {
    exportedAt: new Date().toISOString(),
    tenant,
    employees: decryptedEmployees,
    contracts,
    contractDetails: decryptedContractDetails,
    teams,
    locations,
    vacationRequests,
    wishFreeRequests,
    sicknessReports: decryptedSicknessReports,
    shifts,
    shiftTemplates,
    reminders,
    roles,
    files,
    payrollStatements: decryptedPayrollStatements,
    hinweis:
      "Dateiinhalte (Dokumente) sind nicht eingebettet — die Originale stehen einzeln im Dateien-Bereich zum Download bereit. Audit-Protokolle unterliegen der in den Einstellungen konfigurierten Aufbewahrungsfrist und sind nicht Teil dieses Exports.",
  };
}
