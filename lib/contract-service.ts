import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { uploadTenantFile } from "@/lib/storage/storage.service";
import { assertEmployeeInScope, requireTenantAccess, resolveScopeFilter } from "@/lib/tenant-access";
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

const employeeContractTypes = [
  "Arbeitsvertrag",
  "Befristeter Arbeitsvertrag",
  "Teilzeitvertrag",
  "Änderungsvertrag",
  "Zusatzvereinbarung",
] as const;

type EmployeeContractType = (typeof employeeContractTypes)[number];

function normalizeContractType(value: string | undefined): EmployeeContractType {
  return employeeContractTypes.includes(value as EmployeeContractType)
    ? (value as EmployeeContractType)
    : "Arbeitsvertrag";
}

async function requireContractAccess(tenantSlug: string) {
  return requireTenantAccess(tenantSlug, "payroll", "write");
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
  const scopeFilter = await resolveScopeFilter(access);
  const scopeConstraint =
    scopeFilter.type === "own"
      ? { id: scopeFilter.employeeId ?? "__none__" }
      : scopeFilter.type === "team"
        ? { team: scopeFilter.team }
        : {};
  const fileAccess = await getOptionalFileReadAccess(tenantSlug);
  const contracts = await prisma.tenantEmployeeContract.findMany({
    where: {
      employee: { OR: [{ id: employeeId }, { key: employeeId }], ...scopeConstraint },
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
  const access = await requireContractAccess(input.tenantSlug);
  const tenantId = access.tenantId;
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

  await assertEmployeeInScope(access, employee.id);

  if (input.file.type !== "application/pdf" && !input.file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Jeder Vertrag benötigt eine PDF-Datei.");
  }

  const contractType = normalizeContractType(input.contractType);

  const storedFile = await uploadTenantFile({
    tenantSlug: input.tenantSlug,
    file: input.file,
    ownerType: "employee",
    ownerId: employee.id,
    folderSlug: "vertraege-vereinbarungen",
    folderName: "Verträge & Vereinbarungen",
    ownerName: "HR",
    documentType: contractType,
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
        contractType,
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
          contract: contractType,
          startDate: input.startDate,
          weeklyHours: input.weeklyHours,
          timeline: {
            create: [
              {
                title: `Neuer Vertrag hinterlegt: ${input.title}`,
                tone: "ink",
                tenant: { connect: { id: tenantId } },
              },
            ],
          },
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
  const access = await requireContractAccess(input.tenantSlug);
  const tenantId = access.tenantId;
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

  await assertEmployeeInScope(access, contract.employeeId);

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

/**
 * Feld-Bearbeitung eines bestehenden Vertrags — Gegenstück zu
 * `createEmployeeContract`, ohne die Datei (die bleibt unveränderlich) und
 * ohne den Status (dafür weiterhin `updateEmployeeContractStatus`
 * verwenden). Für den "Bearbeiten"-Button je Vertragsbox unter "Alle
 * Verträge" (`components/EmployeeContracts.tsx`) — die Seiten-weite
 * "Bearbeiten"-Umschaltung wirkt bewusst nicht mehr auf den Vertrags-Tab.
 */
export async function updateEmployeeContractDetails(input: {
  tenantSlug: string;
  employeeId: string;
  contractId: string;
  title: string;
  contractType: string;
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
  const access = await requireContractAccess(input.tenantSlug);
  const tenantId = access.tenantId;
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

  await assertEmployeeInScope(access, contract.employeeId);

  const updated = await prisma.tenantEmployeeContract.update({
    where: { id: contract.id },
    data: {
      title: input.title,
      contractType: normalizeContractType(input.contractType),
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

  await recordContractAudit({
    tenantSlug: input.tenantSlug,
    action: "Vertragsdetails geändert",
    contractId: updated.id,
    detail: updated.title,
  });

  return updated;
}
