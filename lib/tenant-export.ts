import "server-only";
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

  return {
    exportedAt: new Date().toISOString(),
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
    hinweis:
      "Dateiinhalte (Dokumente) sind nicht eingebettet — die Originale stehen einzeln im Dateien-Bereich zum Download bereit. Audit-Protokolle unterliegen der in den Einstellungen konfigurierten Aufbewahrungsfrist und sind nicht Teil dieses Exports.",
  };
}
