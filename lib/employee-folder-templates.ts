import { prisma } from "@/lib/prisma";
import { recordTenantAudit } from "@/lib/audit";
import { ensureEmployeeTemplateFolder } from "@/lib/storage/storage.service";
import { requireTenantAccess } from "@/lib/tenant-access";

/**
 * Ordnervorlagen für Mitarbeiter-Personalakten (To-Do: "Unter
 * Mitarbeiter-Seite Ordnervorlagen erstellen können. Jeder Mitarbeiter hat
 * dann automatisch einen Ordner x."). Anlegen einer Vorlage erzeugt den
 * Ordner sofort für alle bestehenden Mitarbeiter; neue Mitarbeiter bekommen
 * ihn beim Anlegen automatisch mit (siehe `createTenantEmployeeRecord` in
 * lib/employee-service.ts).
 */
export async function getEmployeeFolderTemplates(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "employees", "read");

  return prisma.tenantEmployeeFolderTemplate.findMany({
    where: { tenantId: access.tenantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, createdAt: true },
  });
}

export async function createEmployeeFolderTemplate(input: {
  tenantSlug: string;
  name: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const name = input.name.trim();

  if (!name) {
    throw new Error("Ordnername ist erforderlich.");
  }

  const template = await prisma.tenantEmployeeFolderTemplate.upsert({
    where: { tenantId_name: { tenantId: access.tenantId, name } },
    create: { tenantId: access.tenantId, name },
    update: {},
  });

  const employees = await prisma.tenantEmployee.findMany({
    where: { tenantId: access.tenantId },
    select: { id: true },
  });

  await Promise.all(
    employees.map((employee) =>
      ensureEmployeeTemplateFolder({
        tenantId: access.tenantId,
        employeeId: employee.id,
        name,
        ownerName: access.userName,
      }),
    ),
  );

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Ordnervorlage angelegt",
    source: "Mitarbeiter",
    entityType: "employee-folder-template",
    entityId: template.id,
    detail: `${name} (${employees.length} Mitarbeiter)`,
  });

  return { id: template.id, name: template.name, appliedTo: employees.length };
}
