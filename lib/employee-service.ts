import { auth } from "@/lib/auth";
import {
  employees as sampleEmployees,
  type Employee,
  type EmployeeContractDetails,
  type EmployeeDocument,
  type EmployeeFile,
  type EmployeeFileFolder,
  type EmployeeShift,
  type EmployeeStatus,
  type EmployeeTimelineItem,
  type EmergencyContact,
  type InfoRequest,
  type PayrollStatement,
} from "@/lib/employees";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

type EmployeeRecord = {
  id: string;
  key: string;
  initials: string;
  name: string;
  employeeNumber: string;
  birthDate: string;
  birthPlace: string;
  nationality: string;
  maritalStatus: string;
  privateAddress: string;
  taxId: string;
  socialSecurityNumber: string;
  healthInsurance: string;
  iban: string;
  location: string;
  team: string;
  role: string;
  startDate: string;
  contract: string;
  weeklyHours: string;
  tenure: string;
  status: string;
  email: string;
  phone: string;
  address: string;
  vacationRemaining: number;
  vacationTotal: number;
  vacationTaken: number;
  documentsJson: string;
  fileFoldersJson: string;
  filesJson: string;
  emergencyContactsJson: string;
  payrollStatementsJson: string;
  infoRequestsJson: string;
  shiftsJson: string;
  timelineJson: string;
  contractDetailsJson: string;
};

type EmployeeMutationInput = {
  tenantSlug: string;
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  employeeNumber?: string;
  birthDate?: string;
  birthPlace?: string;
  nationality?: string;
  maritalStatus?: string;
  privateAddress?: string;
  taxId?: string;
  socialSecurityNumber?: string;
  healthInsurance?: string;
  iban?: string;
  location?: string;
  team?: string;
  role?: string;
  startDate?: string;
  contract?: string;
  weeklyHours?: string;
  tenure?: string;
  status?: string;
  email?: string;
  phone?: string;
  address?: string;
  vacationRemaining?: string;
  vacationTotal?: string;
  vacationTaken?: string;
  contractType?: string;
  entryDate?: string;
  exitDate?: string;
  fixedTerm?: string;
  probation?: string;
  noticePeriod?: string;
  position?: string;
  department?: string;
  supervisor?: string;
  workLocation?: string;
  parties?: string;
  collectiveAgreement?: string;
  compensation?: string;
  workingTime?: string;
  vacation?: string;
};

const sampleEmployee = sampleEmployees[0];

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeEmployeeKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function createUniqueEmployeeKey(input: {
  tenantId: string;
  name: string;
  excludeEmployeeId?: string;
}) {
  const keyBase = normalizeEmployeeKey(input.name) || "mitarbeiter";
  let key = keyBase;
  let suffix = 2;

  while (
    await prisma.tenantEmployee.findFirst({
      where: {
        tenantId: input.tenantId,
        key,
        id: input.excludeEmployeeId ? { not: input.excludeEmployeeId } : undefined,
      },
      select: { id: true },
    })
  ) {
    key = `${keyBase}-${suffix}`;
    suffix += 1;
  }

  return key;
}

function normalizeStatus(value?: string): EmployeeStatus {
  return value === "vacation" || value === "absent" ? value : "active";
}

function toInt(value: number | string | undefined, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function buildName(input: Pick<EmployeeMutationInput, "firstName" | "lastName" | "name" | "email">) {
  const name = input.name?.trim();

  if (name) {
    return name;
  }

  const fromParts = [input.firstName?.trim(), input.lastName?.trim()]
    .filter(Boolean)
    .join(" ");

  if (fromParts) {
    return fromParts;
  }

  return input.email?.split("@")[0]?.replace(/[._-]+/g, " ") ?? "Mitarbeiter";
}

function initialsForName(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "--";
}

function contractTitle(contract: string) {
  const labels: Record<string, string> = {
    Unbefristet: "Unbefristeter Arbeitsvertrag",
    Befristet: "Befristeter Arbeitsvertrag",
    Teilzeit: "Teilzeit-Arbeitsvertrag",
    Werkstudentin: "Werkstudentenvertrag",
  };

  return labels[contract] ?? contract;
}

function defaultContractDetails(input: {
  name: string;
  contract: string;
  startDate: string;
  role: string;
  team: string;
  weeklyHours: string;
}): EmployeeContractDetails {
  return {
    ...sampleEmployee.contractDetails,
    linkedFileName: "Arbeitsvertrag.pdf",
    linkedFileMeta: "Noch nicht hochgeladen",
    contractType: contractTitle(input.contract),
    entryDate: input.startDate,
    exitDate: "",
    fixedTerm: input.contract === "Befristet" ? "Befristet" : "Unbefristet",
    position: input.role,
    department: input.team,
    parties: `Mueller & Partner GmbH / ${input.name}`,
    workingTime: `${input.weeklyHours || "38 Std/Woche"}, Schichtmodell laut Dienstplan`,
  };
}

function toEmployee(record: EmployeeRecord): Employee {
  const contractDetails = parseJson<EmployeeContractDetails>(
    record.contractDetailsJson,
    defaultContractDetails({
      name: record.name,
      contract: record.contract,
      startDate: record.startDate,
      role: record.role,
      team: record.team,
      weeklyHours: record.weeklyHours,
    }),
  );

  return {
    id: record.key,
    dbId: record.id,
    key: record.key,
    initials: record.initials,
    name: record.name,
    employeeNumber: record.employeeNumber,
    birthDate: record.birthDate,
    birthPlace: record.birthPlace,
    nationality: record.nationality,
    maritalStatus: record.maritalStatus,
    privateAddress: record.privateAddress,
    taxId: record.taxId,
    socialSecurityNumber: record.socialSecurityNumber,
    healthInsurance: record.healthInsurance,
    iban: record.iban,
    location: record.location,
    team: record.team,
    role: record.role,
    startDate: record.startDate,
    contract: record.contract,
    weeklyHours: record.weeklyHours,
    tenure: record.tenure,
    status: normalizeStatus(record.status),
    email: record.email,
    phone: record.phone,
    address: record.address,
    vacationRemaining: record.vacationRemaining,
    vacationTotal: record.vacationTotal,
    vacationTaken: record.vacationTaken,
    documents: parseJson<EmployeeDocument[]>(record.documentsJson, []),
    fileFolders: parseJson<EmployeeFileFolder[]>(record.fileFoldersJson, []),
    files: parseJson<EmployeeFile[]>(record.filesJson, []),
    emergencyContacts: parseJson<EmergencyContact[]>(record.emergencyContactsJson, []),
    payrollStatements: parseJson<PayrollStatement[]>(record.payrollStatementsJson, []),
    infoRequests: parseJson<InfoRequest[]>(record.infoRequestsJson, []),
    shifts: parseJson<EmployeeShift[]>(record.shiftsJson, []),
    timeline: parseJson<EmployeeTimelineItem[]>(record.timelineJson, []),
    contractDetails,
  };
}

async function getSessionUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.id ?? null;
}

export async function getTenantIdForEmployees(tenantSlug: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });

  return tenant?.id ?? null;
}

export async function getEmployeesForTenant(tenantSlug: string) {
  const tenantId = await getTenantIdForEmployees(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const records = await prisma.tenantEmployee.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  return records.map(toEmployee);
}

export async function getEmployeeForTenant(tenantSlug: string, employeeHandle: string) {
  const tenantId = await getTenantIdForEmployees(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const record = await prisma.tenantEmployee.findFirst({
    where: {
      tenantId,
      key: employeeHandle,
    },
  });

  return record ? toEmployee(record) : null;
}

export async function requireEmployeeManager(tenantSlug: string) {
  const userId = await getSessionUserId();

  if (!userId) {
    throw new Error("Nicht angemeldet.");
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      tenant: { slug: tenantSlug },
    },
    select: {
      role: true,
      roleRef: {
        select: {
          permissions: {
            where: { area: "employees" },
            select: { level: true },
          },
        },
      },
    },
  });

  if (!membership) {
    throw new Error("Keine Berechtigung fuer diesen Mandanten.");
  }

  const legacyRole = membership.role.toUpperCase();
  const permission = membership.roleRef?.permissions[0]?.level ?? "none";

  if (
    legacyRole === "OWNER" ||
    legacyRole === "ADMIN" ||
    legacyRole === "HR" ||
    permission === "write" ||
    permission === "admin"
  ) {
    return true;
  }

  throw new Error("Keine Berechtigung zum Bearbeiten von Mitarbeitern.");
}

async function nextEmployeeNumber(tenantId: string) {
  const count = await prisma.tenantEmployee.count({ where: { tenantId } });
  let suffix = count + 1;

  while (true) {
    const employeeNumber = `MA-${String(suffix).padStart(4, "0")}`;
    const exists = await prisma.tenantEmployee.findFirst({
      where: { tenantId, employeeNumber },
      select: { id: true },
    });

    if (!exists) {
      return employeeNumber;
    }

    suffix += 1;
  }
}

async function syncTeamMemberSnapshots(employee: Employee) {
  if (!employee.dbId) {
    return;
  }

  await prisma.tenantTeamMember.updateMany({
    where: { employeeId: employee.dbId },
    data: {
      initials: employee.initials,
      name: employee.name,
      location: employee.location,
      role: employee.role,
      contract: employee.contract,
      status: employee.status === "vacation" ? "vacation" : "on-duty",
    },
  });
}

export async function createTenantEmployee(input: EmployeeMutationInput) {
  await requireEmployeeManager(input.tenantSlug);

  const tenantId = await getTenantIdForEmployees(input.tenantSlug);

  if (!tenantId) {
    throw new Error("Mandant nicht gefunden.");
  }

  const name = buildName(input);
  const initials = initialsForName(name);
  const key = await createUniqueEmployeeKey({ tenantId, name });
  const contract = input.contract?.trim() || "Unbefristet";
  const startDate = input.startDate?.trim() || "";
  const role = input.role?.trim() || "Mitarbeiter";
  const team = input.team?.trim() || "";
  const weeklyHours = input.weeklyHours?.trim() || "38 Std/Woche";
  const employeeNumber =
    input.employeeNumber?.trim() || (await nextEmployeeNumber(tenantId));

  const record = await prisma.tenantEmployee.create({
    data: {
      tenantId,
      key,
      initials,
      name,
      employeeNumber,
      birthDate: input.birthDate?.trim() || sampleEmployee.birthDate,
      birthPlace: input.birthPlace?.trim() || "",
      nationality: input.nationality?.trim() || "",
      maritalStatus: input.maritalStatus?.trim() || "",
      privateAddress: input.privateAddress?.trim() || "",
      taxId: input.taxId?.trim() || "",
      socialSecurityNumber: input.socialSecurityNumber?.trim() || "",
      healthInsurance: input.healthInsurance?.trim() || "",
      iban: input.iban?.trim() || "",
      location: input.location?.trim() || "",
      team,
      role,
      startDate,
      contract,
      weeklyHours,
      tenure: input.tenure?.trim() || "",
      status: normalizeStatus(input.status),
      email: input.email?.trim() || "",
      phone: input.phone?.trim() || "",
      address: input.address?.trim() || "",
      vacationRemaining: toInt(input.vacationRemaining, 0),
      vacationTotal: toInt(input.vacationTotal, 30),
      vacationTaken: toInt(input.vacationTaken, 0),
      documentsJson: JSON.stringify([] satisfies EmployeeDocument[]),
      fileFoldersJson: JSON.stringify([] satisfies EmployeeFileFolder[]),
      filesJson: JSON.stringify([] satisfies EmployeeFile[]),
      emergencyContactsJson: JSON.stringify([] satisfies EmergencyContact[]),
      payrollStatementsJson: JSON.stringify([] satisfies PayrollStatement[]),
      infoRequestsJson: JSON.stringify([] satisfies InfoRequest[]),
      shiftsJson: JSON.stringify([] satisfies EmployeeShift[]),
      timelineJson: JSON.stringify([
        {
          title: "Mitarbeiter angelegt",
          date: new Intl.DateTimeFormat("de-DE").format(new Date()),
          tone: "success",
        },
      ] satisfies EmployeeTimelineItem[]),
      contractDetailsJson: JSON.stringify(
        defaultContractDetails({ name, contract, startDate, role, team, weeklyHours }),
      ),
    },
  });

  return toEmployee(record);
}

export async function updateTenantEmployee(input: EmployeeMutationInput & { employeeId: string }) {
  await requireEmployeeManager(input.tenantSlug);

  const tenantId = await getTenantIdForEmployees(input.tenantSlug);

  if (!tenantId) {
    throw new Error("Mandant nicht gefunden.");
  }

  const current = await prisma.tenantEmployee.findFirst({
    where: { tenantId, id: input.employeeId },
  });

  if (!current) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  const currentEmployee = toEmployee(current);
  const name = buildName({ name: input.name || current.name, email: input.email });
  const contract = input.contract?.trim() || current.contract;
  const startDate = input.startDate?.trim() || current.startDate;
  const role = input.role?.trim() || current.role;
  const team = input.team?.trim() || current.team;
  const weeklyHours = input.weeklyHours?.trim() || current.weeklyHours;
  const contractDetails: EmployeeContractDetails = {
    ...currentEmployee.contractDetails,
    contractType: input.contractType?.trim() || currentEmployee.contractDetails.contractType,
    entryDate: input.entryDate?.trim() || startDate,
    exitDate: input.exitDate?.trim() ?? currentEmployee.contractDetails.exitDate,
    fixedTerm: input.fixedTerm?.trim() || currentEmployee.contractDetails.fixedTerm,
    probation: input.probation?.trim() || currentEmployee.contractDetails.probation,
    noticePeriod: input.noticePeriod?.trim() || currentEmployee.contractDetails.noticePeriod,
    position: input.position?.trim() || role,
    department: input.department?.trim() || team,
    supervisor: input.supervisor?.trim() || currentEmployee.contractDetails.supervisor,
    workLocation: input.workLocation?.trim() || current.location,
    parties: input.parties?.trim() || currentEmployee.contractDetails.parties,
    collectiveAgreement:
      input.collectiveAgreement?.trim() ||
      currentEmployee.contractDetails.collectiveAgreement,
    compensation: input.compensation?.trim() || currentEmployee.contractDetails.compensation,
    workingTime: input.workingTime?.trim() || weeklyHours,
    vacation: input.vacation?.trim() || currentEmployee.contractDetails.vacation,
  };
  const key =
    name === current.name
      ? current.key
      : await createUniqueEmployeeKey({
          tenantId,
          name,
          excludeEmployeeId: input.employeeId,
        });

  const record = await prisma.tenantEmployee.update({
    where: { id: input.employeeId },
    data: {
      key,
      initials: initialsForName(name),
      name,
      employeeNumber: input.employeeNumber?.trim() || current.employeeNumber,
      birthDate: input.birthDate?.trim() ?? current.birthDate,
      birthPlace: input.birthPlace?.trim() ?? current.birthPlace,
      nationality: input.nationality?.trim() ?? current.nationality,
      maritalStatus: input.maritalStatus?.trim() ?? current.maritalStatus,
      privateAddress: input.privateAddress?.trim() ?? current.privateAddress,
      taxId: input.taxId?.trim() ?? current.taxId,
      socialSecurityNumber:
        input.socialSecurityNumber?.trim() ?? current.socialSecurityNumber,
      healthInsurance: input.healthInsurance?.trim() ?? current.healthInsurance,
      iban: input.iban?.trim() ?? current.iban,
      location: input.location?.trim() ?? current.location,
      team,
      role,
      startDate,
      contract,
      weeklyHours,
      tenure: input.tenure?.trim() ?? current.tenure,
      status: normalizeStatus(input.status ?? current.status),
      email: input.email?.trim() ?? current.email,
      phone: input.phone?.trim() ?? current.phone,
      address: input.address?.trim() ?? current.address,
      vacationRemaining: toInt(input.vacationRemaining, current.vacationRemaining),
      vacationTotal: toInt(input.vacationTotal, current.vacationTotal),
      vacationTaken: toInt(input.vacationTaken, current.vacationTaken),
      contractDetailsJson: JSON.stringify(contractDetails),
    },
  });
  const employee = toEmployee(record);

  await syncTeamMemberSnapshots(employee);

  return employee;
}

export async function deleteTenantEmployee(input: {
  tenantSlug: string;
  employeeId: string;
}) {
  await requireEmployeeManager(input.tenantSlug);

  const tenantId = await getTenantIdForEmployees(input.tenantSlug);

  if (!tenantId) {
    throw new Error("Mandant nicht gefunden.");
  }

  const employee = await prisma.tenantEmployee.findFirst({
    where: { id: input.employeeId, tenantId },
    select: { id: true },
  });

  if (!employee) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  await prisma.$transaction([
    prisma.tenantTeamMember.deleteMany({ where: { employeeId: input.employeeId } }),
    prisma.tenantEmployee.delete({ where: { id: input.employeeId } }),
  ]);
}
