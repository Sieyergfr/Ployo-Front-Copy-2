import { DataTableStatus } from "@/components/DataTable";
import AddressFields from "@/components/AddressFields";
import AuditLogPanel from "@/components/AuditLogPanel";
import DatePickerField from "@/components/DatePickerField";
import EmployeeDocumentSlots from "@/components/EmployeeDocumentSlots";
import OwnerFilesTab from "@/components/OwnerFilesTab";
import EmployeeContracts, { type EmployeeContractItem } from "@/components/EmployeeContracts";
import { LocationMultiSelectDropdown } from "@/components/TeamEditControls";
import EmergencyContactsCard from "@/components/EmergencyContactsCard";
import PayrollUploadButton from "@/components/PayrollUploadButton";
import PayrollDownloadButton from "@/components/PayrollDownloadButton";
import EmployeeInfoRequestButton from "@/components/EmployeeInfoRequestButton";
import { InfoRequestRow } from "@/components/InfoRequestDetail";
import {
  OffboardEmployeeButton,
  ReactivateEmployeeButton,
} from "@/components/OffboardEmployeeButton";
import { UnsavedChangesGuard } from "@/components/EditSafety";
import {
  EmployeeDeleteButton,
  EmployeeEditFormAndBar,
  EmployeeInviteButton,
  RetentionDeleteButton,
} from "@/components/EmployeeActionForms";
import { getAuditLogsForEntity } from "@/lib/audit";
import { getEmployeeForTenant } from "@/lib/employee-service";
import { getDeletionEligibilityForEmployee, type CategoryEligibility } from "@/lib/retention-service";
import { RETENTION_POLICIES } from "@/lib/data-retention";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import { getInvitationStatusForEmail } from "@/lib/invitation-service";
import { getEmployeeContracts } from "@/lib/contract-service";
import { getLocationsForTenant } from "@/lib/location-service";
import { getTeamsForTenant } from "@/lib/team-service";
import {
  CONTRACT_FILE_NOT_UPLOADED,
  employeeStatusConfig,
  type EmployeeStatus,
  type Employee,
  type EmployeeTimelineItem,
} from "@/lib/employees";
import { getRolesForTenant } from "@/lib/role-service";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Pencil,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { getFileUploadOptions } from "@/lib/files-server";
import { type FileUploadOptions } from "@/lib/files";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: PageProps<"/u/[tenant]/employees/[employeeId]">) {
  const { tenant, employeeId } = await params;
  const employee = await getEmployeeForTenant(tenant, employeeId);
  const t = await getTranslations("EmployeeDetail");

  return {
    title: employee?.name ?? t("metadataFallbackTitle"),
  };
}

type T = Awaited<ReturnType<typeof getTranslations>>;

function DetailCard({
  title,
  children,
  className = "",
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-card border border-border bg-white px-6 py-[22px] ${className}`}
    >
      <h2 className="mb-[18px] font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PayrollTab({
  employee,
  tenant,
  canManage,
  t,
}: {
  employee: Employee;
  tenant: string;
  canManage: boolean;
  t: T;
}) {
  return (
    <DetailCard
      title={
        <span className="flex flex-wrap items-center justify-between gap-2">
          {t("payrollTitle")}
          {canManage && (
            <PayrollUploadButton
              tenant={tenant}
              employeeId={employee.dbId ?? ""}
              employeeHandle={employee.id}
            />
          )}
        </span>
      }
      className="[&>h2]:mb-3.5"
    >
      {employee.payrollStatements.length === 0 && (
        <p className="border-t border-border-soft pt-3 text-[12.5px] text-muted">
          {t("noPayrollStatements")}
        </p>
      )}
      {employee.payrollStatements.map((statement) => (
        <div
          key={statement.id}
          className="grid items-center gap-3 border-t border-border-soft py-3.5 sm:grid-cols-[1fr_150px_150px_120px_40px]"
        >
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-ink">
              {statement.period}
            </div>
            <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted">
              {statement.fileName} · {statement.issuedAt}
            </div>
          </div>
          <div className="font-mono text-[12px] text-muted-2">
            {t("gross", { amount: statement.gross })}
          </div>
          <div className="font-mono text-[12px] text-ink">
            {t("net", { amount: statement.net })}
          </div>
          {/* Nur "Korrigiert" sagt etwas aus. "Verfügbar" stand an jeder
              Zeile, die ohnehin da ist — reines Rauschen neben dem
              Download-Knopf. Die Spalte bleibt, damit die Zeilen bündig
              bleiben. */}
          {statement.status === "corrected" ? (
            <span className="h-fit rounded-[7px] border border-border-light px-2 py-[3px] text-center font-mono text-[10px] text-muted-2">
              {t("corrected")}
            </span>
          ) : (
            <span />
          )}
          <PayrollDownloadButton tenant={tenant} fileId={statement.storageFileId} />
        </div>
      ))}
    </DetailCard>
  );
}

function InfoRequestsCard({
  employee,
  tenant,
  employeeHandle,
  canManage,
  t,
}: {
  employee: Employee;
  tenant: string;
  employeeHandle: string;
  canManage: boolean;
  t: T;
}) {
  return (
    <DetailCard
      title={
        <span className="flex flex-wrap items-center justify-between gap-2">
          {t("infoRequestsTitle")}
          {canManage && (
            <EmployeeInfoRequestButton
              tenant={tenant}
              employeeId={employee.dbId ?? ""}
              employeeHandle={employeeHandle}
              employeeName={employee.name}
            />
          )}
        </span>
      }
      className="[&>h2]:mb-3.5"
    >
      {employee.infoRequests.length === 0 && (
        <p className="border-t border-border-soft pt-3 text-[12.5px] text-muted">
          {t("noInfoRequests")}
        </p>
      )}
      {employee.infoRequests.map((request) => (
        <InfoRequestRow key={request.id} request={request} tenant={tenant} />
      ))}
    </DetailCard>
  );
}

function FieldValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.5px] text-muted">
        {label}
      </div>
      <div
        className={`mt-[5px] text-[13.5px] text-ink ${
          mono ? "font-mono text-[13px]" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function EditableTextField({
  id,
  label,
  name,
  value,
  type = "text",
  mono = false,
  min,
}: {
  id: string;
  label: string;
  name: string;
  value: string | number;
  type?: "text" | "email" | "tel" | "number";
  mono?: boolean;
  min?: number;
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        className={`input bg-white ${mono ? "input-mono" : ""}`}
        defaultValue={value}
        min={min}
      />
    </div>
  );
}

function EditableDateField({
  id,
  label,
  name,
  value,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <DatePickerField id={id} name={name} defaultValue={value} />
    </div>
  );
}

function EditableSelectField({
  id,
  label,
  name,
  value,
  options,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  options: string[];
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select
        id={id}
        name={name}
        className="input cursor-pointer bg-white"
        defaultValue={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function FilesTab({
  employee,
  tenant,
  employeeHref,
  uploadOptions,
  canManageFiles,
  activeFolder,
  t,
}: {
  employee: Employee;
  tenant: string;
  employeeHref: string;
  uploadOptions: FileUploadOptions;
  canManageFiles: boolean;
  activeFolder?: string;
  t: T;
}) {
  return (
    <>
      <EmployeeDocumentSlots
        tenant={tenant}
        employeeId={employee.dbId ?? employee.id}
        employeeHandle={employee.id}
        files={employee.files}
        canManage={canManageFiles}
      />
      <OwnerFilesTab
        tenant={tenant}
        ownerType="employee"
        ownerId={employee.dbId ?? ""}
        basePath={employeeHref}
        folders={employee.fileFolders}
        files={employee.files}
        uploadOptions={uploadOptions}
        canManageFiles={canManageFiles}
        initialFolderPath={activeFolder ?? ""}
        emptyLabel={t("noFilesInRecord")}
        employeeHandle={employee.id}
      />
    </>
  );
}

function hasContractDetails(employee: Employee) {
  const contract = employee.contractDetails;
  const linkedFileMeta = contract.linkedFileMeta.trim().toLowerCase();

  if (linkedFileMeta === CONTRACT_FILE_NOT_UPLOADED) {
    return false;
  }

  if (linkedFileMeta) {
    return true;
  }

  const detailValues = [
    contract.supervisor,
    contract.workLocation,
    contract.compensation,
    contract.workingTime,
    contract.vacation,
    contract.noticePeriod,
    contract.collectiveAgreement,
  ];

  return detailValues.some((value) => {
    if (typeof value !== "string") {
      return false;
    }

    const normalized = value.trim().toLowerCase();

    return normalized !== "" && normalized !== CONTRACT_FILE_NOT_UPLOADED;
  });
}

function ContractDetailsPrompt({
  employeeName,
  href,
  t,
}: {
  employeeName: string;
  href: string;
  t: T;
}) {
  return (
    <section className="rounded-card border border-warning/30 bg-[#FFF7EA] px-5 py-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-warning">
          <BriefcaseBusiness size={18} />
        </span>
        <div className="min-w-[220px] flex-1">
          <div className="text-[14px] font-semibold text-ink">
            {t("contractDetailsMissingTitle")}
          </div>
          <p className="mt-1 text-[12.5px] leading-5 text-muted-2">
            {t("contractDetailsMissingBody", { name: employeeName })}
          </p>
        </div>
        <Link href={href} className="btn btn-primary btn-sm">
          {t("insertContractDetails")}
        </Link>
      </div>
    </section>
  );
}

function ContractTab({
  employee,
  tenant,
  contracts,
  canManagePayroll,
  locationOptions,
  t,
}: {
  employee: Employee;
  tenant: string;
  contracts: EmployeeContractItem[];
  canManagePayroll: boolean;
  locationOptions: string[];
  t: T;
}) {
  const details = employee.contractDetails;
  const activeContract = contracts.find((contract) => contract.status === "active");
  const value = (primary: string | number | undefined, fallback: string) =>
    primary === undefined || primary === "" || primary === 0 ? fallback : String(primary);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
      <div className="flex flex-col gap-4">
        <DetailCard
          title={
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-border-soft text-muted-2"><BriefcaseBusiness size={18} /></span>
                <span><span className="block">{t("contractDetailsTitle")}</span><span className="mt-0.5 block font-mono text-[10.5px] font-normal text-muted">{t("contractDetailsSubtitle")}</span></span>
              </span>
              {activeContract && <span className="rounded-[7px] bg-success/10 px-2.5 py-1 font-mono text-[10px] text-success">{t("active")}</span>}
            </div>
          }
        >
          {/*
            Bearbeiten passiert seit dem "Alle Verträge"-Umbau ausschließlich
            über den Bearbeiten-Button je Vertragsbox (EmployeeContracts.tsx)
            — die Seiten-weite "Bearbeiten"-Umschaltung wirkt bewusst nicht
            mehr auf diesen Tab, daher hier immer die Lese-Ansicht.
          */}
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <FieldValue label={t("contractType")} value={value(activeContract?.contractType, details.contractType || employee.contract)} />
            <FieldValue label={t("entryDate")} value={value(activeContract?.startDate, details.entryDate || employee.startDate)} mono />
            <FieldValue label={t("position")} value={value(activeContract?.position, details.position)} />
            <FieldValue label={t("department")} value={value(activeContract?.department, details.department)} />
            <FieldValue label={t("workLocation")} value={value(activeContract?.workLocation, details.workLocation)} />
            <FieldValue
              label={t("weeklyHours")}
              value={(() => {
                const hours = value(activeContract?.weeklyHours, details.workingTime || employee.weeklyHours);
                return hours ? t("weeklyHoursPerWeek", { hours }) : hours;
              })()}
            />
            <FieldValue
              label={t("grossCompensation")}
              value={details.compensationGross ? `${details.compensationGross} €` : "—"}
            />
            <FieldValue label={t("vacation")} value={activeContract?.vacationDays ? t("vacationDaysCount", { count: activeContract.vacationDays }) : details.vacation} />
            <FieldValue label={t("probationUntil")} value={value(activeContract?.probationEndDate, details.probation)} mono />
            <FieldValue label={t("noticePeriod")} value={value(activeContract?.noticePeriod, details.noticePeriod)} />
          </div>
        </DetailCard>

        {activeContract?.notes && (
          <DetailCard title={t("notes")}><p className="whitespace-pre-wrap text-[13px] leading-6 text-muted-2">{activeContract.notes}</p></DetailCard>
        )}
      </div>

      <DetailCard title={t("allContracts", { count: contracts.length })} className="[&>h2]:mb-3.5">
        <EmployeeContracts
          tenant={tenant}
          employeeId={employee.dbId ?? employee.id}
          employeeHandle={employee.id}
          contracts={contracts}
          canManage={canManagePayroll}
          locationOptions={locationOptions}
        />
      </DetailCard>
    </div>
  );
}

function ShiftRow({ shift }: { shift: Employee["shifts"][number] }) {
  return (
    <div className="flex items-center gap-3 border-t border-border-soft py-2">
      <span className="size-[11px] shrink-0 rounded-[3px] bg-ink" />
      <span className="w-7 font-mono text-[12px] font-semibold text-ink">
        {shift.day}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
        {shift.label}
      </span>
      <span className="font-mono text-[12px] text-muted-2">{shift.time}</span>
    </div>
  );
}

function TimelineDot({ tone }: { tone: EmployeeTimelineItem["tone"] }) {
  const color = {
    ink: "bg-ink",
    success: "bg-success",
    muted: "bg-muted",
  }[tone];

  return <span className={`size-2 rounded-full ${color}`} />;
}

function TimelineItem({
  item,
  isLast,
}: {
  item: EmployeeTimelineItem;
  isLast: boolean;
}) {
  return (
    <div className="flex gap-[13px] pb-3.5">
      <div className="flex shrink-0 flex-col items-center pt-[3px]">
        <TimelineDot tone={item.tone} />
        {!isLast && <span className="mt-[5px] w-px flex-1 bg-border" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink">{item.title}</div>
        <div className="mt-[3px] font-mono text-[10.5px] text-muted">
          {item.date}
        </div>
      </div>
    </div>
  );
}

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/employees/[employeeId]">) {
  const { tenant, employeeId } = await params;
  const { tab, edit, invited, folder } = await searchParams;
  const activeFolder = typeof folder === "string" ? folder : undefined;
  const t = await getTranslations("EmployeeDetail");
  const tAddress = await getTranslations("AddressFields");
  const employee = await withAccessRedirect(tenant, () =>
    getEmployeeForTenant(tenant, employeeId),
  );

  if (!employee) {
    notFound();
  }

  const capabilities = await getTenantCapabilities(tenant);
  const canEditEmployee = hasPermissionLevel(capabilities.employees.level, "write");
  const canDeleteEmployee = capabilities.employees.canDelete;
  const canViewEmployeeAudit = capabilities.employees.canViewAudit;
  const canInvite = hasPermissionLevel(capabilities.settings.level, "write");
  // Verträge, Dateien, Lohnabrechnungen und sensible Daten sind eigene,
  // unabhängig konfigurierbare Berechtigungen unter "Mitarbeiter" (siehe
  // lib/roles.ts) — bewusst nicht mehr eine einzelne "payroll"-Berechtigung.
  const canViewContracts = hasPermissionLevel(capabilities.contracts.level, "read");
  const canManageContracts = hasPermissionLevel(capabilities.contracts.level, "write");
  const canViewPayrollStatements = hasPermissionLevel(capabilities.payroll.level, "read");
  const canManagePayrollStatements = hasPermissionLevel(capabilities.payroll.level, "write");
  // Nur die Bearbeitbarkeit wird hier gesteuert — ob die Werte selbst
  // sichtbar sind (statt "•••"), entscheidet bereits getEmployeeForTenant().
  const canEditSensitiveData = hasPermissionLevel(capabilities.sensitiveData.level, "write");
  // Mutterschutz ist bewusst ein eigener Berechtigungsbereich, nicht Teil
  // von sensitiveData (siehe lib/roles.ts) — z. B. damit die Lohnbuchhaltung
  // nicht automatisch mitsieht.
  const canViewMutterschutz = hasPermissionLevel(capabilities.mutterschutz.level, "read");
  const canEditMutterschutz = hasPermissionLevel(capabilities.mutterschutz.level, "write");
  const canViewEmployeeFiles = hasPermissionLevel(capabilities.employeeFiles.level, "read");
  const canManageFiles = hasPermissionLevel(capabilities.employeeFiles.level, "write");
  const deletionEligibility =
    canDeleteEmployee && employee.status === "former" && employee.dbId
      ? await getDeletionEligibilityForEmployee(tenant, employee.dbId)
      : null;

  // Rollen/Teams/Standorte/Uploadoptionen sind hier nur Zusatzinfo für
  // Dropdowns im Bearbeiten-Formular — fehlende Berechtigung dafür (z. B.
  // "Rollen" ist admin-only) soll die Profilseite selbst nicht sperren.
  // Verträge brauchen eigens "contracts:read" — ohne das bleibt der
  // Vertrag-Tab einfach leer statt die ganze Seite zu blockieren.
  const emptyUploadOptions: FileUploadOptions = { employees: [], locations: [], roles: [], users: [] };
  const [roles, teams, locations, uploadOptions, contracts] = await Promise.all([
    getRolesForTenant(tenant).catch(() => null).then((v) => v ?? []),
    getTeamsForTenant(tenant).catch(() => null).then((v) => v ?? []),
    getLocationsForTenant(tenant).catch(() => null).then((v) => v ?? []),
    getFileUploadOptions(tenant).catch(() => emptyUploadOptions),
    canViewContracts
      ? getEmployeeContracts(tenant, employeeId).catch(() => [])
      : Promise.resolve([]),
  ]);

  const status = employeeStatusConfig[employee.status];
  const isFilesTab = tab === "files" && canViewEmployeeFiles;
  const isContractTab = tab === "contract" && canViewContracts;
  const isPayrollTab = tab === "payroll" && canViewPayrollStatements;
  const isHomeTab = !isFilesTab && !isContractTab && !isPayrollTab;
  const isEditableTab = isHomeTab || isContractTab;
  const isEditing = edit === "1" && isEditableTab && canEditEmployee;
  const employeeHref = `/u/${tenant}/employees/${employee.id}`;
  const activeTabHref = isContractTab ? `${employeeHref}?tab=contract` : employeeHref;
  const auditEntries = canViewEmployeeAudit
    ? await getAuditLogsForEntity({
        tenantSlug: tenant,
        area: "employees",
        entityType: "employee",
        entityId: employee.dbId ?? employee.id,
        take: 10,
      })
    : [];
  const employeeEditHref = isContractTab
    ? `${employeeHref}?tab=contract&edit=1`
    : `${employeeHref}?edit=1`;
  const contractEditHref = `${employeeHref}?tab=contract&edit=1`;
  const showContractDetailsPrompt = isHomeTab && canViewContracts && !hasContractDetails(employee);
  const vacationPercent = Math.round(
    (employee.vacationTaken / employee.vacationTotal) * 100,
  );
  const statusOptions: EmployeeStatus[] = ["active", "vacation", "absent"];
  const invitation =
    employee.email && !employee.hasAccount
      ? await getInvitationStatusForEmail(tenant, employee.email)
      : null;
  const hasPendingInvitation =
    invitation?.status === "PENDING" && !invitation.expired;
  const invitationHint = hasPendingInvitation
    ? t("invitationPending")
    : invitation?.status === "PENDING" && invitation.expired
      ? t("invitationExpired")
      : null;
  const wasInvited = invited === "1" && Boolean(employee.email);
  const roleOptions = roles.length > 0
    ? roles.map((role) => role.name)
    : [t("defaultRoleName")];
  const teamOptions = teams.map((team) => team.name);
  const locationOptions = locations.map((location) => location.name);

  return (
    <>
      <UnsavedChangesGuard active={isEditing} />
      <EmployeeEditFormAndBar
        tenant={tenant}
        employeeId={employee.dbId ?? ""}
        employeeHandle={employee.id}
        activeTab={isContractTab ? "contract" : "home"}
        cancelHref={activeTabHref}
        isEditing={isEditing}
      >
      <div className="mb-[22px] flex flex-wrap items-center gap-3.5">
        <Link href={`/u/${tenant}/employees`} className="btn btn-secondary btn-sm">
          <ArrowLeft size={14} />
          {t("backToEmployees")}
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-[0.5px] text-muted">
          {t("personnelFileOf", { number: employee.employeeNumber })}
        </span>
      </div>

      <section className="mb-4 flex flex-wrap items-center gap-[22px] rounded-card border border-border bg-white p-7">
        <span className="flex size-[72px] shrink-0 items-center justify-center rounded-full bg-ink text-[24px] font-semibold text-white">
          {employee.initials}
        </span>

        <div className="min-w-[200px] flex-1">
          <h1 className="m-0 font-display text-[clamp(26px,3vw,34px)] font-semibold leading-[1.05] tracking-[-1px] text-ink">
            {isEditing ? (
              <input
                className="input max-w-[420px] bg-white font-display text-[26px] font-semibold text-ink sm:text-[34px]"
                name="name"
                defaultValue={employee.name}
                aria-label={t("nameAriaLabel")}
                required
              />
            ) : (
              employee.name
            )}
          </h1>
          <div className="mt-[7px] text-[14px] text-muted-2">
            {employee.role} {"\u00b7"} {employee.team} {"\u00b7"}{" "}
            {employee.locations?.length ? employee.locations.join(", ") : employee.location}
          </div>
          <div className="mt-[11px] flex flex-wrap items-center gap-3">
            <DataTableStatus label={status.label} tone={status.tone} />
            {employee.status === "former" && employee.endDate && (
              <span className="font-mono text-[12px] text-danger">
                {t("departureLabel", { date: employee.endDate })}
              </span>
            )}
            <span className="font-mono text-[12px] text-muted">
              {employee.employeeNumber}
            </span>
            {employee.hasAccount ? (
              <span className="font-mono text-[12px] text-muted">
                {t("accountLinked")}
              </span>
            ) : invitationHint ? (
              <span className="font-mono text-[12px] text-muted">
                {invitationHint}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-[9px]">
          {isEditing ? (
            canDeleteEmployee && (
              <EmployeeDeleteButton
                className="btn btn-secondary btn-sm text-danger"
                description={t("deleteConfirmDescription", { name: employee.name })}
              >
                {t("delete")}
              </EmployeeDeleteButton>
            )
          ) : (
            <>
              <EmployeeInfoRequestButton
                tenant={tenant}
                employeeId={employee.dbId ?? ""}
                employeeHandle={employee.id}
                employeeName={employee.name}
              />
              {canInvite &&
                !employee.hasAccount &&
                (employee.email ? (
                  <EmployeeInviteButton
                    label={hasPendingInvitation ? t("inviteAgain") : t("invite")}
                  />
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled
                    title={t("inviteDisabledTitle")}
                  >
                    <UserPlus size={14} />
                    {t("invite")}
                  </button>
                ))}
              {canEditEmployee && employee.status === "former" && (
                <ReactivateEmployeeButton
                  tenant={tenant}
                  employeeId={employee.dbId ?? ""}
                  employeeHandle={employee.id}
                />
              )}
              {canEditEmployee && employee.status !== "former" && (
                <OffboardEmployeeButton
                  tenant={tenant}
                  employeeId={employee.dbId ?? ""}
                  employeeHandle={employee.id}
                  employeeName={employee.name}
                />
              )}
              {canEditEmployee && (
                <Link href={employeeEditHref} className="btn btn-secondary btn-sm">
                  <Pencil size={14} />
                  {t("edit")}
                </Link>
              )}
            </>
          )}
        </div>
      </section>

      {wasInvited && (
        <div className="mb-4 rounded-card border border-success/25 bg-success/5 px-5 py-3.5 text-[13px] text-ink">
          {t.rich("invitedBanner", {
            email: employee.email,
            b: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </div>
      )}

      <div className="mb-5 flex gap-[26px] border-b border-border">
        <Link
          href={employeeHref}
          className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
            isHomeTab
              ? "border-ink font-semibold text-ink"
              : "border-transparent font-medium text-muted"
          }`}
        >
          {t("tabHome")}
        </Link>
        {canViewContracts && (
          <Link
            href={`${employeeHref}?tab=contract`}
            className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
              isContractTab
                ? "border-ink font-semibold text-ink"
                : "border-transparent font-medium text-muted"
            }`}
          >
            {t("tabContract")}
            <span className="font-mono text-[11px] text-muted">{contracts.length}</span>
          </Link>
        )}
        {canViewEmployeeFiles && (
          <Link
            href={`${employeeHref}?tab=files`}
            className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
              isFilesTab
                ? "border-ink font-semibold text-ink"
                : "border-transparent font-medium text-muted"
            }`}
          >
            {t("tabFiles")}
            <span className="font-mono text-[11px] text-muted">
              {employee.files.length + employee.fileFolders.length}
            </span>
          </Link>
        )}
        {canViewPayrollStatements && (
          <Link
            href={`${employeeHref}?tab=payroll`}
            className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
              isPayrollTab
                ? "border-ink font-semibold text-ink"
                : "border-transparent font-medium text-muted"
            }`}
          >
            {t("tabPayroll")}
            <span className="font-mono text-[11px] text-muted">
              {employee.payrollStatements.length}
            </span>
          </Link>
        )}
      </div>

      {isFilesTab ? (
        <FilesTab
          employee={employee}
          tenant={tenant}
          employeeHref={employeeHref}
          uploadOptions={uploadOptions}
          canManageFiles={canManageFiles}
          activeFolder={activeFolder}
          t={t}
        />
      ) : isPayrollTab ? (
        <PayrollTab employee={employee} tenant={tenant} canManage={canManagePayrollStatements} t={t} />
      ) : isContractTab ? (
        <ContractTab
          employee={employee}
          tenant={tenant}
          contracts={contracts as EmployeeContractItem[]}
          canManagePayroll={canManageContracts}
          locationOptions={locationOptions}
          t={t}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {showContractDetailsPrompt && (
            <ContractDetailsPrompt
              employeeName={employee.name}
              href={contractEditHref}
              t={t}
            />
          )}

          <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            <div className="flex flex-col gap-4">
              <DetailCard title={t("masterDataTitle")}>
              {isEditing ? (
                <>
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                  <EditableTextField
                    id="employee-number"
                    label={t("employeeNumber")}
                    name="employeeNumber"
                    value={employee.employeeNumber}
                    mono
                  />
                  <fieldset disabled={!canEditSensitiveData} className="contents border-0 p-0 m-0">
                    <EditableDateField
                      id="employee-birth-date"
                      label={t("birthDate")}
                      name="birthDate"
                      value={employee.birthDate}
                    />
                    <EditableTextField
                      id="employee-birth-place"
                      label={t("birthPlace")}
                      name="birthPlace"
                      value={employee.birthPlace}
                    />
                    <EditableTextField
                      id="employee-nationality"
                      label={t("nationality")}
                      name="nationality"
                      value={employee.nationality}
                    />
                    <EditableTextField
                      id="employee-marital-status"
                      label={t("maritalStatus")}
                      name="maritalStatus"
                      value={employee.maritalStatus}
                    />
                    <div className="sm:col-span-2">
                      <div className="mb-2 label">{t("address")}</div>
                      <AddressFields
                        idPrefix="employee-private-address"
                        namePrefix="privateAddress"
                        defaults={employee.privateAddressFields}
                        t={tAddress}
                      />
                    </div>
                  </fieldset>
                  <EditableTextField
                    id="employee-master-email"
                    label={t("email")}
                    name="email"
                    type="email"
                    value={employee.email}
                    mono
                  />
                  <EditableTextField
                    id="employee-master-phone"
                    label={t("phone")}
                    name="phone"
                    type="tel"
                    value={employee.phone}
                    mono
                  />
                  <fieldset disabled={!canEditSensitiveData} className="contents border-0 p-0 m-0">
                    <EditableTextField
                      id="employee-tax-id"
                      label={t("taxId")}
                      name="taxId"
                      value={employee.taxId}
                      mono
                    />
                    <EditableTextField
                      id="employee-social-security-number"
                      label={t("socialSecurityNumber")}
                      name="socialSecurityNumber"
                      value={employee.socialSecurityNumber}
                      mono
                    />
                    <EditableTextField
                      id="employee-health-insurance"
                      label={t("healthInsurance")}
                      name="healthInsurance"
                      value={employee.healthInsurance}
                    />
                    <EditableTextField
                      id="employee-iban"
                      label={t("iban")}
                      name="iban"
                      value={employee.iban}
                      mono
                    />
                  </fieldset>
                </div>
                {!canEditSensitiveData && (
                  <p className="mt-3 text-[11.5px] leading-[1.5] text-muted">
                    {t("payrollFieldsHiddenNote")}
                  </p>
                )}
                </>
              ) : (
                <div className="grid gap-y-[18px] gap-x-[22px] [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
                  <FieldValue
                    label={t("employeeNumber")}
                    value={employee.employeeNumber}
                    mono
                  />
                  <FieldValue
                    label={t("birthDate")}
                    value={employee.birthDate}
                    mono
                  />
                  <FieldValue label={t("birthPlace")} value={employee.birthPlace} />
                  <FieldValue label={t("nationality")} value={employee.nationality} />
                  <FieldValue label={t("maritalStatus")} value={employee.maritalStatus} />
                  <FieldValue label={t("address")} value={employee.privateAddress} />
                  <FieldValue label={t("email")} value={employee.email} mono />
                  <FieldValue label={t("phone")} value={employee.phone} mono />
                  <FieldValue label={t("taxId")} value={employee.taxId} mono />
                  <FieldValue
                    label={t("socialSecurityNumber")}
                    value={employee.socialSecurityNumber}
                    mono
                  />
                  <FieldValue
                    label={t("healthInsurance")}
                    value={employee.healthInsurance}
                  />
                  <FieldValue label={t("iban")} value={employee.iban} mono />
                </div>
              )}
            </DetailCard>

            {canViewMutterschutz && (
              <DetailCard title={t("mutterschutzTitle")}>
                {isEditing && canEditMutterschutz ? (
                  <div className="flex flex-col gap-3">
                    <input type="hidden" name="maternityProtectionActive_present" value="1" />
                    <label className="flex items-center gap-2.5 text-[13.5px] text-ink">
                      <input
                        type="checkbox"
                        name="maternityProtectionActive"
                        defaultChecked={employee.maternityProtectionActive}
                      />
                      {t("maternityProtectionActive")}
                    </label>
                    <EditableTextField
                      id="employee-maternity-protection-note"
                      label={t("maternityProtectionNote")}
                      name="maternityProtectionNote"
                      value={employee.maternityProtectionNote}
                    />
                    <p className="text-[11.5px] leading-[1.5] text-muted">
                      {t("maternityProtectionHint")}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <FieldValue
                      label={t("maternityProtectionActive")}
                      value={
                        employee.maternityProtectionActive
                          ? t("maternityProtectionActiveYes")
                          : t("maternityProtectionActiveNo")
                      }
                    />
                    {employee.maternityProtectionNote && (
                      <FieldValue
                        label={t("maternityProtectionNote")}
                        value={employee.maternityProtectionNote}
                      />
                    )}
                  </div>
                )}
              </DetailCard>
            )}

            <DetailCard title={t("employmentTitle")}>
              {isEditing ? (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                  <EditableSelectField
                    id="employee-contract"
                    label={t("contractType")}
                    name="contract"
                    value={employee.contract}
                    options={[
                      t("contractUnlimited"),
                      t("contractPartTime"),
                      t("contractFixedTerm"),
                      t("contractWorkingStudent"),
                    ]}
                  />
                  <EditableDateField
                    id="employee-start-date"
                    label={t("entryDate")}
                    name="startDate"
                    value={employee.startDate}
                  />
                  <EditableTextField
                    id="employee-tenure"
                    label={t("employedSince")}
                    name="tenure"
                    value={employee.tenure}
                  />
                  <EditableSelectField
                    id="employee-team"
                    label={t("team")}
                    name="team"
                    value={employee.team}
                    options={teamOptions}
                  />
                  <EditableSelectField
                    id="employee-role"
                    label={t("permissionRole")}
                    name="role"
                    value={employee.role}
                    options={roleOptions}
                  />
                  <EditableSelectField
                    id="employee-status"
                    label={t("status")}
                    name="status"
                    value={employee.status}
                    options={statusOptions}
                  />
                </div>
              ) : (
                <div className="grid gap-y-[18px] gap-x-[22px] [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
                  <FieldValue label={t("contractType")} value={employee.contract} />
                  <FieldValue label={t("weeklyHours")} value={employee.weeklyHours} />
                  <FieldValue
                    label={t("entryDate")}
                    value={employee.startDate}
                    mono
                  />
                  <FieldValue
                    label={t("employedSince")}
                    value={employee.tenure}
                  />
                  <FieldValue label={t("team")} value={employee.team} />
                  <FieldValue label={t("permissionRole")} value={employee.role} />
                </div>
              )}
            </DetailCard>

            <DetailCard title={t("vacationTitle")}>
              {isEditing ? (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
                  <EditableTextField
                    id="employee-vacation-remaining"
                    label={t("vacationRemainingField")}
                    name="vacationRemaining"
                    type="number"
                    value={employee.vacationRemaining}
                    min={0}
                  />
                  <EditableTextField
                    id="employee-vacation-total"
                    label={t("vacationTotalField")}
                    name="vacationTotal"
                    type="number"
                    value={employee.vacationTotal}
                    min={0}
                  />
                  <EditableTextField
                    id="employee-vacation-taken"
                    label={t("vacationTakenField")}
                    name="vacationTaken"
                    type="number"
                    value={employee.vacationTaken}
                    min={0}
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-2">
                    <span className="font-display text-[38px] font-semibold leading-none tracking-[-1.5px] text-ink">
                      {employee.vacationRemaining}
                    </span>
                    <span className="mb-[5px] text-[13px] text-muted">
                      {t("vacationOfTotal", { total: employee.vacationTotal })}
                    </span>
                  </div>
                  <div className="my-4 h-2 overflow-hidden rounded-full bg-border-soft">
                    <div
                      className="h-full w-[var(--pct)] rounded-full bg-ink"
                      style={{ "--pct": `${vacationPercent}%` } as CSSProperties}
                    />
                  </div>
                  <div className="flex justify-between font-mono text-[11px] text-muted">
                    <span>{t("vacationDaysTaken", { count: employee.vacationTaken })}</span>
                    <span>{vacationPercent}%</span>
                  </div>
                </>
              )}
            </DetailCard>

            <DetailCard title={t("shiftsThisWeek")} className="[&>h2]:mb-3.5">
              <div className="flex flex-col gap-2">
                {employee.shifts.map((shift) => (
                  <ShiftRow key={shift.day} shift={shift} />
                ))}
              </div>
            </DetailCard>

              <InfoRequestsCard
                employee={employee}
                tenant={tenant}
                employeeHandle={employee.id}
                canManage={canEditEmployee}
                t={t}
              />
            </div>

            <div className="flex flex-col gap-4">
              <EmergencyContactsCard
                tenant={tenant}
                employeeId={employee.dbId ?? ""}
                employeeHandle={employee.id}
                contacts={employee.emergencyContacts}
              />

            <DetailCard title={t("contactTitle")}>
              {isEditing ? (
                <div className="grid gap-3">
                  <FieldValue label={t("email")} value={employee.email} mono />
                  <FieldValue label={t("phone")} value={employee.phone} mono />
                  <p className="text-[12px] text-muted -mt-1">
                    {t("contactFieldsHint")}
                  </p>
                  <div>
                    <div className="mb-2 label">{t("locationAddress")}</div>
                    <AddressFields
                      idPrefix="employee-address"
                      namePrefix="address"
                      defaults={employee.addressFields}
                      className="grid gap-3"
                      t={tAddress}
                    />
                  </div>
                  <LocationMultiSelectDropdown
                    defaultLocations={employee.locations ?? (employee.location ? [employee.location] : [])}
                    options={locationOptions}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <FieldValue label={t("email")} value={employee.email} mono />
                  <FieldValue label={t("phone")} value={employee.phone} mono />
                  <FieldValue label={t("locationAddress")} value={employee.address} />
                </div>
              )}
            </DetailCard>

            <DetailCard title={t("historyTitle")} className="[&>h2]:mb-4">
              {employee.timeline.map((item, index) => (
                <TimelineItem
                  key={`${item.title}-${item.date}`}
                  item={item}
                  isLast={index === employee.timeline.length - 1}
                />
              ))}
              </DetailCard>
            </div>
          </div>
        </div>
      )}

      {deletionEligibility && (
        <div className="mt-4">
          <DetailCard title={t("retentionTitle")}>
            <p className="mb-4 text-[13px] leading-[1.55] text-muted-2">
              {t("retentionDescription")}
            </p>
            <form id="employee-retention-form" className="flex flex-col gap-2">
              <input type="hidden" name="tenant" value={tenant} />
              <input type="hidden" name="employeeId" value={employee.dbId ?? ""} />
              <input type="hidden" name="employeeHandle" value={employee.id} />
              {deletionEligibility.map((entry: CategoryEligibility) => (
                <label
                  key={entry.category}
                  className={`flex items-start gap-2.5 rounded-btn border px-3 py-2.5 text-[13px] ${
                    entry.eligible
                      ? "border-danger/25 bg-danger/5"
                      : "border-border-light bg-bg text-muted-2"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="categories"
                    value={entry.category}
                    disabled={!entry.eligible}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-semibold text-ink">
                      {RETENTION_POLICIES[entry.category].beschreibung}
                    </span>
                    <br />
                    {entry.reason}
                  </span>
                </label>
              ))}
            </form>
            <div className="mt-3 flex justify-end">
              <RetentionDeleteButton
                className="btn btn-secondary btn-sm text-danger"
                title={t("retentionDeleteSelected")}
                description={t("retentionDeleteConfirmDescription")}
              >
                {t("retentionDeleteSelected")}
              </RetentionDeleteButton>
            </div>
          </DetailCard>
        </div>
      )}

      {canViewEmployeeAudit && (
        <div className="mt-4">
          <AuditLogPanel entries={auditEntries} />
        </div>
      )}
      </EmployeeEditFormAndBar>
    </>
  );
}
