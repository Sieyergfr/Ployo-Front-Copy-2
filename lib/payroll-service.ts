import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { uploadTenantFile } from "@/lib/storage/storage.service";
import { requireTenantAccess } from "@/lib/tenant-access";

/**
 * Gleiche Berechtigungsebene wie Verträge (siehe contract-service.ts) —
 * es gibt keinen eigenen "payroll:write"-Gate für Dateien, `uploadTenantFile`
 * prüft zusätzlich "files:write".
 */
async function requirePayrollAccess(tenantSlug: string) {
  return requireTenantAccess(tenantSlug, "payroll", "write");
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

  const statement = await prisma.tenantPayrollStatement.create({
    data: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      fileId: storedFile.id,
      period,
      gross: input.gross.trim(),
      net: input.net.trim(),
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

  return statement;
}
