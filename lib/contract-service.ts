import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { uploadTenantFile } from "@/lib/storage/storage.service";
import { requireTenantAccess } from "@/lib/tenant-access";
import { canAccessFileAcl, getOptionalFileReadAccess } from "@/lib/file-access";

export const contractStatuses = [
  "draft",
  "active",
  "terminated",
  "expired",
  "inactive",
] as const;

export type ContractStatus = (typeof contractStatuses)[number];

export const contractStatusLabels: Record<ContractStatus, string> = {
  draft: "Entwurf",
  active: "Aktiv",
  terminated: "Gekündigt",
  expired: "Abgelaufen",
  inactive: "Inaktiv",
};

async function requireContractAccess(tenantSlug: string) {
  return (await requireTenantAccess(tenantSlug, "payroll", "write")).tenantId;
}

async function recordContractAudit(input: {
  tenantSlug: string;
  action: string;
  contractId: string;
  detail: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "payroll", "write");

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: input.action,
    source: "Verträge",
    entityType: "contract",
    entityId: input.contractId,
    detail: input.detail,
  });
}

export async function getEmployeeContracts(tenantSlug: string, employeeId: string) {
  const access = await requireTenantAccess(tenantSlug, "payroll", "read");
  const fileAccess = await getOptionalFileReadAccess(tenantSlug);
  const contracts = await prisma.tenantEmployeeContract.findMany({
    where: {
      employee: { OR: [{ id: employeeId }, { key: employeeId }] },
      tenantId: access.tenantId,
    },
    include: {
      file: {
        include: { parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } } },
      },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
  return fileAccess
    ? contracts.filter((contract) => canAccessFileAcl(contract.file.parent ?? contract.file, fileAccess))
    : [];
}

export async function createEmployeeContract(input: {
  tenantSlug: string;
  employeeId: string;
  file: File;
  title: string;
  contractType: string;
  status: ContractStatus;
  startDate: string;
  endDate: string;
  probationEndDate: string;
  noticePeriod: string;
  position: string;
  department: string;
  workLocation: string;
  weeklyHours: string;
  compensation: string;
  vacationDays: number;
  notes: string;
}) {
  const tenantId = await requireContractAccess(input.tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: {
      tenantId,
      OR: [{ id: input.employeeId }, { key: input.employeeId }],
    },
    select: { id: true, key: true, name: true },
  });

  if (!employee) {
    throw new Error("Mitarbeiter wurde nicht gefunden.");
  }

  if (input.file.type !== "application/pdf" && !input.file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Jeder Vertrag benötigt eine PDF-Datei.");
  }

  const storedFile = await uploadTenantFile({
    tenantSlug: input.tenantSlug,
    file: input.file,
    ownerType: "employee",
    ownerId: employee.id,
    folderSlug: "vertraege-vereinbarungen",
    folderName: "Verträge & Vereinbarungen",
    ownerName: "HR",
    documentType: input.contractType || "Arbeitsvertrag",
    validFrom: input.startDate,
    expiresAt: input.endDate,
    description: input.title,
    assignedEmployeeId: employee.id,
    tags: ["Vertrag"],
  });

  const created = await prisma.$transaction(async (tx) => {
    if (input.status === "active") {
      await tx.tenantEmployeeContract.updateMany({
        where: { tenantId, employeeId: employee.id, status: "active" },
        data: { status: "inactive" },
      });
    }

    const contract = await tx.tenantEmployeeContract.create({
      data: {
        tenantId,
        employeeId: employee.id,
        fileId: storedFile.id,
        title: input.title,
        contractType: input.contractType,
        status: input.status,
        startDate: input.startDate,
        endDate: input.endDate,
        probationEndDate: input.probationEndDate,
        noticePeriod: input.noticePeriod,
        position: input.position,
        department: input.department,
        workLocation: input.workLocation,
        weeklyHours: input.weeklyHours,
        compensation: input.compensation,
        vacationDays: input.vacationDays,
        notes: input.notes,
      },
    });

    if (input.status === "active") {
      await tx.tenantEmployee.update({
        where: { id: employee.id },
        data: {
          contract: input.contractType,
          startDate: input.startDate,
          weeklyHours: input.weeklyHours,
        },
      });
    }

    return contract;
  });

  await recordContractAudit({
    tenantSlug: input.tenantSlug,
    action: "Vertrag hinterlegt",
    contractId: created.id,
    detail: `${employee.name}: ${input.title}`,
  });

  return created;
}

export async function updateEmployeeContractStatus(input: {
  tenantSlug: string;
  employeeId: string;
  contractId: string;
  status: ContractStatus;
  terminationDate?: string;
  terminationReason?: string;
}) {
  const tenantId = await requireContractAccess(input.tenantSlug);
  const contract = await prisma.tenantEmployeeContract.findFirst({
    where: {
      id: input.contractId,
      tenantId,
      employee: { OR: [{ id: input.employeeId }, { key: input.employeeId }] },
    },
    select: { id: true, employeeId: true },
  });

  if (!contract) {
    throw new Error("Vertrag wurde nicht gefunden.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.status === "active") {
      await tx.tenantEmployeeContract.updateMany({
        where: { tenantId, employeeId: contract.employeeId, status: "active" },
        data: { status: "inactive" },
      });
    }

    return tx.tenantEmployeeContract.update({
      where: { id: contract.id },
      data: {
        status: input.status,
        terminationDate: input.status === "terminated" ? input.terminationDate ?? "" : "",
        terminationReason: input.status === "terminated" ? input.terminationReason ?? "" : "",
      },
    });
  });

  await recordContractAudit({
    tenantSlug: input.tenantSlug,
    action: "Vertragsstatus geändert",
    contractId: updated.id,
    detail: `${updated.title}: ${contractStatusLabels[input.status]}`,
  });

  return updated;
}
