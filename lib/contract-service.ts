import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadTenantFile } from "@/lib/storage/storage.service";
import { headers } from "next/headers";

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
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: { userId: session.user.id, tenant: { slug: tenantSlug } },
    select: { tenantId: true },
  });

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  return membership.tenantId;
}

export async function getEmployeeContracts(tenantSlug: string, employeeId: string) {
  return prisma.tenantEmployeeContract.findMany({
    where: {
      employee: { OR: [{ id: employeeId }, { key: employeeId }] },
      tenant: { slug: tenantSlug },
    },
    include: { file: true },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
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

  return prisma.$transaction(async (tx) => {
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

  return prisma.$transaction(async (tx) => {
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
}
