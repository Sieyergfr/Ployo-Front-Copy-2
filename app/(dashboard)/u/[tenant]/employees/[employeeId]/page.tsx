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

  type EmployeeStatus,
  type Employee,
  type EmployeeTimelineItem,
} from "@/lib/employees";
import { getRolesForTenant } from "@/lib/role-service";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Pencil,
} from "lucide-react";
import { AccessLockButton } from "@/components/dashboard/employees/EmployeeAccessButtons";
import { EmployeeAvatar, EmployeeStatusChip } from "@/components/dashboard/employees/EmployeesTable";
import { DbCard } from "@/components/dashboard/ui";
import TimeEntriesDays, { TimeTotals } from "@/components/TimeEntriesDays";
import TimePeriodNav from "@/components/TimePeriodNav";
import { getEmployeeAbsences } from "@/lib/employee-insights";
import { buildEmployeeWorkStats } from "@/lib/employee-overview";
import { employeeProfileGaps, yearsSince } from "@/lib/employees";
import { parseWeeklyHours } from "@/lib/my-times";
import { getTenantTimeEntries } from "@/lib/time-tracking-service";
import { getLocale } from "next-intl/server";
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
  canDeleteFiles,
  activeFolder,
  t,
}: {
  employee: Employee;
  tenant: string;
  employeeHref: string;
  uploadOptions: FileUploadOptions;
  canManageFiles: boolean;
  canDeleteFiles: boolean;
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
        canDeleteFiles={canDeleteFiles}
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
  const query = await searchParams;
  const { tab, edit, invited, folder } = query;
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
  const canDeleteFiles = canManageFiles && capabilities.files.canDelete;
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

  const recordTabs = [
    "overview",
    "data",
    "contract",
    "files",
    "absences",
    "times",
    "payroll",
    "requests",
    "log",
  ] as const;
  type RecordTab = (typeof recordTabs)[number];
  const locale = await getLocale();
  const intlLocale = locale === "en" ? "en-GB" : "de-DE";
  const tUi = await getTranslations("EmployeeRecord");
  const todayIso = new Date().toISOString().slice(0, 10);
  const weekday = (new Date(`${todayIso}T00:00:00Z`).getUTCDay() + 6) % 7;
  const statsFrom = new Date(Date.parse(`${todayIso}T00:00:00Z`) - (weekday + 84) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [absences, statsEntries] = await Promise.all([
    employee.dbId
      ? getEmployeeAbsences({ tenantSlug: tenant, employeeId: employee.dbId, team: employee.team })
      : Promise.resolve(null),
    employee.dbId
      ? getTenantTimeEntries({ tenantSlug: tenant, employeeId: employee.dbId, from: statsFrom, to: todayIso }).catch(
          () => null,
        )
      : Promise.resolve(null),
  ]);
  const timeTrackingVisible = Boolean(statsEntries?.timeTrackingEnabled);
  const absencesVisible = Boolean(absences && (absences.vacations !== null || absences.sickness !== null));
  const tabVisible: Record<RecordTab, boolean> = {
    overview: true,
    data: true,
    contract: canViewContracts,
    files: canViewEmployeeFiles,
    absences: absencesVisible,
    times: timeTrackingVisible,
    payroll: canViewPayrollStatements,
    requests: true,
    log: true,
  };
  const requestedTab = (recordTabs as readonly string[]).includes(String(tab)) ? (tab as RecordTab) : null;
  // Früher war die Startseite der Akte die Stammdaten-Ansicht; ein altes
  // `?edit=1` ohne Tab öffnet deshalb weiterhin die Stammdaten.
  const activeTab: RecordTab =
    requestedTab && tabVisible[requestedTab] ? requestedTab : edit === "1" ? "data" : "overview";
  const isFilesTab = activeTab === "files";
  const isContractTab = activeTab === "contract";
  const isDataTab = activeTab === "data";
  const isEditableTab = isDataTab || isContractTab;
  const isEditing = edit === "1" && isEditableTab && canEditEmployee;
  const employeeHref = `/u/${tenant}/employees/${employee.id}`;
  const tabHref = (id: RecordTab) => (id === "overview" ? employeeHref : `${employeeHref}?tab=${id}`);
  const activeTabHref = tabHref(activeTab);
  const auditEntries = canViewEmployeeAudit
    ? await getAuditLogsForEntity({
        tenantSlug: tenant,
        entityType: "employee",
        entityId: employee.dbId ?? employee.id,
        take: 20,
      })
    : [];
  const employeeEditHref = isContractTab ? `${employeeHref}?tab=contract&edit=1` : `${employeeHref}?tab=data&edit=1`;
  const contractEditHref = `${employeeHref}?tab=contract&edit=1`;
  const showContractDetailsPrompt = isDataTab && canViewContracts && !hasContractDetails(employee);
  const vacationPercent = Math.round((employee.vacationTaken / Math.max(1, employee.vacationTotal)) * 100);
  const statusOptions: EmployeeStatus[] = ["active", "vacation", "absent"];
  const invitation =
    employee.email && !employee.hasAccount ? await getInvitationStatusForEmail(tenant, employee.email) : null;
  const hasPendingInvitation = invitation?.status === "PENDING" && !invitation.expired;
  const invitationHint = hasPendingInvitation
    ? t("invitationPending")
    : invitation?.status === "PENDING" && invitation.expired
      ? t("invitationExpired")
      : null;
  const wasInvited = invited === "1" && Boolean(employee.email);
  const roleOptions = roles.length > 0 ? roles.map((role) => role.name) : [t("defaultRoleName")];
  const teamOptions = teams.map((team) => team.name);
  const locationOptions = locations.map((location) => location.name);
  const gaps = employeeProfileGaps(employee);
  const years = yearsSince(employee.startDate);
  const dateFormat = new Intl.DateTimeFormat(intlLocale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const formatDate = (value: string | null | undefined) =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? dateFormat.format(new Date(`${value}T12:00:00Z`)) : (value ?? "");
  const tenure =
    years === null
      ? ""
      : Math.floor(years) > 0
        ? tUi("tenure", { years: Math.floor(years), months: Math.floor((years % 1) * 12) })
        : tUi("tenureMonths", { months: Math.floor(years * 12) });
  const weeklyHours = parseWeeklyHours(employee.weeklyHours);
  const stats = statsEntries
    ? buildEmployeeWorkStats({
        days: statsEntries.days,
        today: statsEntries.today,
        weeklyTargetMinutes: weeklyHours ? weeklyHours * 60 : null,
      })
    : null;
  const hours = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 });
  const openInfoRequests = employee.infoRequests.filter((request) => request.status === "open").length;
  const exitDate = employee.contractDetails?.exitDate ?? "";
  const daysToExit = /^\d{4}-\d{2}-\d{2}$/.test(exitDate)
    ? Math.round((Date.parse(`${exitDate}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000)
    : null;
  const attentionItems: Array<{ tone: string; title: string; text: string; href?: string; link?: string }> = [];

  if (daysToExit !== null && daysToExit >= 0 && daysToExit <= 120 && employee.status !== "former") {
    attentionItems.push({
      tone: "#e07b00",
      title: tUi("attention.fixedTermTitle", { date: formatDate(exitDate) }),
      text: tUi("attention.fixedTermText", { days: daysToExit }),
      href: canViewContracts ? tabHref("contract") : undefined,
      link: tUi("attention.toContracts"),
    });
  }

  if (gaps.missing.length > 0) {
    attentionItems.push({
      tone: "#8b6ed4",
      title: tUi("attention.missingTitle", { count: gaps.missing.length }),
      text: tUi("attention.missingText"),
      href: tabHref("requests"),
      link: tUi("attention.sendRequest"),
    });
  }

  if (stats && stats.overtimeMinutes > 10 * 60) {
    attentionItems.push({
      tone: "#b4332a",
      title: tUi("attention.overtimeTitle"),
      text: tUi("attention.overtimeText", { hours: hours.format(stats.overtimeMinutes / 60) }),
      href: tabHref("times"),
      link: tUi("attention.viewTimes"),
    });
  }

  if (openInfoRequests > 0) {
    attentionItems.push({
      tone: "#2a6fdb",
      title: tUi("attention.openRequestsTitle", { count: openInfoRequests }),
      text: tUi("attention.openRequestsText"),
      href: tabHref("requests"),
      link: tUi("attention.viewRequests"),
    });
  }

  const period = query.period === "month" ? "month" : "week";
  const timesView =
    activeTab === "times" && employee.dbId
      ? await getTenantTimeEntries({
          tenantSlug: tenant,
          employeeId: employee.dbId,
          period,
          date: typeof query.date === "string" ? query.date : undefined,
        }).catch(() => null)
      : null;
  const vacationStatus: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: tUi("absences.pending"), color: "#9a5b00", bg: "rgba(224,123,0,0.10)" },
    approved: { label: tUi("absences.approved"), color: "#1f5d2c", bg: "rgba(53,122,82,0.10)" },
    rejected: { label: tUi("absences.rejected"), color: "#b4332a", bg: "rgba(180,51,42,0.08)" },
  };
  const tabCounts: Partial<Record<RecordTab, number>> = {
    contract: contracts.length,
    files: employee.files.length + employee.fileFolders.length,
    payroll: employee.payrollStatements.length,
    requests: openInfoRequests,
  };
  const kpiCard = (label: string, value: string, unit: string, hint: string, hintColor = "#6e6e6b") => (
    <DbCard className="db-insight flex flex-col gap-2 p-5" key={label}>
      <span className="text-[13px] font-medium text-[#6e6e6b]">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-[32px] leading-none font-semibold tracking-[-1px]">{value}</span>
        <span className="text-[14px] text-[#6e6e6b]">{unit}</span>
      </span>
      <span className="text-[13px]" style={{ color: hintColor }}>
        {hint}
      </span>
    </DbCard>
  );
  const smallButton =
    "db-btn2 db-focus inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-[#ecebe7] bg-[#f2f1ed] px-4 text-[14px] font-semibold text-ink no-underline disabled:cursor-default disabled:opacity-60";

  return (
    <>
      <UnsavedChangesGuard active={isEditing} />
      <EmployeeEditFormAndBar
        tenant={tenant}
        employeeId={employee.dbId ?? ""}
        employeeHandle={employee.id}
        activeTab={isContractTab ? "contract" : "data"}
        cancelHref={activeTabHref}
        isEditing={isEditing}
      >
        <div className="mb-4 flex items-center gap-2 text-[14px]">
          <Link
            href={`/u/${tenant}/employees`}
            className="db-btn2 inline-flex min-h-9 items-center gap-1.5 rounded-[9px] border border-[#ecebe7] bg-white px-3 font-medium text-ink no-underline"
          >
            <ArrowLeft size={14} />
            {t("backToEmployees")}
          </Link>
          <span className="text-[#9a9a96]">/</span>
          <span className="font-medium">{employee.name}</span>
        </div>

        <DbCard className="relative mb-5 overflow-hidden p-0">
          <div className="db-hero-glow opacity-40" aria-hidden="true" />
          <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4 px-6 pt-6 pb-5">
            <EmployeeAvatar employee={employee} size={76} />
            <div className="flex min-w-[220px] flex-1 flex-col gap-2">
              <h1 className="m-0 font-display text-[clamp(26px,3vw,34px)] leading-[1.05] font-semibold tracking-[-1px]">
                {isEditing && isDataTab ? (
                  <input
                    className="input max-w-[420px] bg-white font-display text-[26px] font-semibold text-ink"
                    name="name"
                    defaultValue={employee.name}
                    aria-label={t("nameAriaLabel")}
                    required
                    maxLength={100}
                  />
                ) : (
                  employee.name
                )}
              </h1>
              <span className="flex flex-wrap items-center gap-2">
                <EmployeeStatusChip status={employee.status} label={tUi(`status.${employee.status}`)} />
                {employee.status === "former" && employee.endDate && (
                  <span className="text-[12.5px] text-[#b4332a]">{t("departureLabel", { date: employee.endDate })}</span>
                )}
              </span>
              <span className="text-[13.5px] text-[#6e6e6b]">
                {[
                  employee.employeeNumber,
                  employee.role,
                  employee.startDate ? `${tUi("since", { date: formatDate(employee.startDate) })}${tenure ? ` (${tenure})` : ""}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {(employee.teams?.length ? employee.teams : [employee.team]).filter(Boolean).map((team) => (
                  <span key={team} className="rounded-[6px] bg-[#f2f1ed] px-2 py-0.5 text-[12.5px]">
                    {team}
                  </span>
                ))}
                {(employee.locations?.length ? employee.locations : [employee.location]).filter(Boolean).map((location) => (
                  <span key={location} className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#ecebe7] bg-white px-2 py-0.5 text-[12.5px]">
                    <span className="size-1.5 rounded-[2px] bg-[#8b6ed4]" />
                    {location}
                  </span>
                ))}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-[12.5px] ${
                    employee.appAccessLockedAt
                      ? "bg-[rgba(180,51,42,0.08)] text-[#b4332a]"
                      : employee.hasAccount
                        ? "bg-[rgba(53,122,82,0.10)] text-[#1f5d2c]"
                        : "bg-[#f2f1ed] text-[#6e6e6b]"
                  }`}
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  {employee.appAccessLockedAt
                    ? tUi("accessLocked")
                    : employee.hasAccount
                      ? t("accountLinked")
                      : (invitationHint ?? tUi("noAppAccount"))}
                </span>
              </span>
            </div>

            {gaps.total > 0 && (
              <div className="flex items-center gap-3 rounded-[14px] border border-[#ecebe7] bg-white/80 px-4 py-3">
                <span
                  className="relative size-[46px] shrink-0 rounded-full"
                  style={{ background: `conic-gradient(#8b6ed4 0 ${gaps.percent}%, #ecebe7 0)` }}
                >
                  <span className="absolute inset-[5px] flex items-center justify-center rounded-full bg-white text-[11px] font-semibold">
                    {gaps.percent}%
                  </span>
                </span>
                <span className="flex flex-col">
                  <span className="text-[14px] font-semibold">{tUi("recordComplete")}</span>
                  <span className={`text-[12.5px] ${gaps.missing.length ? "text-[#9a5b00]" : "text-[#1f5d2c]"}`}>
                    {gaps.missing.length ? tUi("missingCount", { count: gaps.missing.length }) : tUi("allComplete")}
                  </span>
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {isEditing ? (
                canDeleteEmployee && (
                  <EmployeeDeleteButton
                    className={`${smallButton} text-[#b4332a]`}
                    description={t("deleteConfirmDescription", { name: employee.name })}
                  >
                    {t("delete")}
                  </EmployeeDeleteButton>
                )
              ) : (
                <>
                  {canInvite && !employee.hasAccount && employee.email && (
                    <EmployeeInviteButton label={hasPendingInvitation ? t("inviteAgain") : tUi("inviteToApp")} />
                  )}
                  <EmployeeInfoRequestButton
                    tenant={tenant}
                    employeeId={employee.dbId ?? ""}
                    employeeHandle={employee.id}
                    employeeName={employee.name}
                    className={smallButton}
                    label={tUi("sendRequest")}
                  />
                  {canEditEmployee && (
                    <Link href={employeeEditHref} className={smallButton}>
                      <Pencil size={14} />
                      {t("edit")}
                    </Link>
                  )}
                  {canEditEmployee && employee.hasAccount && employee.dbId && (
                    <AccessLockButton
                      tenant={tenant}
                      employeeId={employee.dbId}
                      employeeHandle={employee.id}
                      employeeName={employee.name}
                      locked={Boolean(employee.appAccessLockedAt)}
                      className={smallButton}
                    />
                  )}
                  {canEditEmployee && employee.status === "former" && (
                    <ReactivateEmployeeButton tenant={tenant} employeeId={employee.dbId ?? ""} employeeHandle={employee.id} />
                  )}
                  {canEditEmployee && employee.status !== "former" && (
                    <OffboardEmployeeButton
                      tenant={tenant}
                      employeeId={employee.dbId ?? ""}
                      employeeHandle={employee.id}
                      employeeName={employee.name}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          <nav aria-label={tUi("tabsLabel")} className="relative flex gap-6 overflow-x-auto border-t border-[#ecebe7] px-6">
            {recordTabs
              .filter((id) => tabVisible[id])
              .map((id) => {
                const active = activeTab === id;
                const count = tabCounts[id];

                return (
                  <Link
                    key={id}
                    href={tabHref(id)}
                    aria-current={active ? "page" : undefined}
                    className={`-mb-px inline-flex items-center gap-1.5 border-b-2 py-3.5 text-[14px] whitespace-nowrap no-underline ${
                      active ? "border-[#8b6ed4] font-semibold text-ink" : "border-transparent font-medium text-[#6e6e6b]"
                    }`}
                  >
                    {tUi(`tabs.${id}`)}
                    {count !== undefined && count > 0 && (
                      <span
                        className={`rounded-full px-1.5 text-[11px] font-semibold ${
                          id === "requests" ? "bg-[#fff1d6] text-[#9a5b00]" : "bg-[#f2f1ed] text-[#6e6e6b]"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
          </nav>
        </DbCard>

        {employee.appAccessLockedAt && (
          <div className="mb-4 rounded-[12px] border border-[rgba(180,51,42,0.25)] bg-[rgba(180,51,42,0.05)] px-5 py-3.5 text-[13px]">
            {tUi("lockedBanner", { date: formatDate(employee.appAccessLockedAt.slice(0, 10)) })}
            {employee.appAccessLockReason ? ` · ${employee.appAccessLockReason}` : ""}
          </div>
        )}

        {wasInvited && (
          <div className="mb-4 rounded-[12px] border border-[rgba(53,122,82,0.25)] bg-[rgba(53,122,82,0.05)] px-5 py-3.5 text-[13px] text-ink">
            {t.rich("invitedBanner", {
              email: employee.email,
              b: (chunks) => <span className="font-medium">{chunks}</span>,
            })}
          </div>
        )}

        {activeTab === "overview" && (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
              {stats &&
                kpiCard(
                  tUi("kpi.overtime"),
                  `${stats.overtimeMinutes > 0 ? "+" : ""}${hours.format(stats.overtimeMinutes / 60)}`,
                  tUi("hours"),
                  tUi("kpi.last12Weeks"),
                  stats.overtimeMinutes > 10 * 60 ? "#9a5b00" : "#6e6e6b",
                )}
              {stats &&
                kpiCard(
                  tUi("kpi.monthHours", {
                    month: new Intl.DateTimeFormat(intlLocale, { month: "long", timeZone: "UTC" }).format(new Date(`${todayIso}T12:00:00Z`)),
                  }),
                  hours.format(stats.monthWorkedMinutes / 60),
                  stats.monthPlannedMinutes > 0 ? tUi("ofHours", { hours: hours.format(stats.monthPlannedMinutes / 60) }) : tUi("hours"),
                  stats.monthPlannedMinutes > 0
                    ? tUi("kpi.ofTarget", { percent: Math.round((stats.monthWorkedMinutes / stats.monthPlannedMinutes) * 100) })
                    : tUi("kpi.noPlan"),
                )}
              {kpiCard(
                tUi("kpi.vacationLeft"),
                String(employee.vacationRemaining),
                tUi("days"),
                employee.vacationCarryover > 0 ? tUi("kpi.carryoverExpires", { days: employee.vacationCarryover }) : tUi("kpi.ofTotal", { total: employee.vacationTotal }),
                employee.vacationCarryover > 0 ? "#9a5b00" : "#6e6e6b",
              )}
              {absences?.sickDaysThisYear !== null &&
                absences?.sickDaysThisYear !== undefined &&
                kpiCard(
                  tUi("kpi.sickDays", { year: todayIso.slice(0, 4) }),
                  String(absences.sickDaysThisYear),
                  tUi("days"),
                  absences.teamAverageSickDays !== null ? tUi("kpi.teamAverage", { days: hours.format(absences.teamAverageSickDays) }) : "",
                  absences.teamAverageSickDays !== null && absences.sickDaysThisYear <= absences.teamAverageSickDays ? "#1f5d2c" : "#6e6e6b",
                )}
            </div>

            <div className="db-body grid items-start gap-5 [grid-template-columns:minmax(0,1.35fr)_minmax(0,0.95fr)]">
              {stats ? (
                <DbCard>
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="m-0 font-display text-[19px] font-semibold tracking-[-0.4px]">{tUi("weeklyHoursTitle")}</h2>
                    <span className="text-[13px] text-[#6e6e6b]">
                      {weeklyHours ? tUi("weeklyHoursMeta", { hours: hours.format(weeklyHours) }) : tUi("weeklyHoursMetaPlanned")}
                    </span>
                  </div>
                  {(() => {
                    const target = weeklyHours ? weeklyHours * 60 : 0;
                    const max = Math.max(target, ...stats.weeks.map((week) => Math.max(week.worked, week.planned)), 60);

                    return (
                      <div className="relative">
                        {target > 0 && (
                          <div
                            aria-hidden="true"
                            className="absolute right-0 left-0 border-t border-dashed border-[#c9c8c3]"
                            style={{ bottom: `calc(${(target / max) * 180}px + 40px)` }}
                          >
                            <span className="absolute -top-4 right-0 font-mono text-[9.5px] text-[#9a9a96] uppercase">{tUi("target")}</span>
                          </div>
                        )}
                        <div className="flex items-end gap-1.5">
                          {stats.weeks.map((week) => {
                            const below = target > 0 && week.planned > 0 && week.worked < target * 0.6 && !week.isCurrent;

                            return (
                              <div key={week.monday} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                                <div className="flex h-[180px] w-full items-end">
                                  <div
                                    className="w-full rounded-[6px]"
                                    title={`${hours.format(week.worked / 60)} ${tUi("hours")}`}
                                    style={{
                                      height: `${Math.max(2, (week.worked / max) * 180)}px`,
                                      background: below
                                        ? "repeating-linear-gradient(135deg, rgba(180,51,42,0.35) 0 3px, rgba(180,51,42,0.08) 3px 7px)"
                                        : week.isCurrent
                                          ? "linear-gradient(180deg, #a78ee8, #8b6ed4)"
                                          : target > 0 && week.worked >= target
                                            ? "#8b6ed4"
                                            : "#c9b8f5",
                                    }}
                                  />
                                </div>
                                <span className="text-[12px] font-semibold">{hours.format(week.worked / 60)}</span>
                                <span className="font-mono text-[9.5px] text-[#9a9a96]">
                                  {(() => {
                                    const date = new Date(`${week.monday}T00:00:00Z`);
                                    const thursday = new Date(date);

                                    thursday.setUTCDate(date.getUTCDate() + 3);

                                    const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));

                                    return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
                                  })()}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </DbCard>
              ) : (
                <DbCard>
                  <h2 className="m-0 mb-2 font-display text-[19px] font-semibold tracking-[-0.4px]">{t("employmentTitle")}</h2>
                  <p className="m-0 text-[13px] text-[#6e6e6b]">{tUi("noTimeTracking")}</p>
                </DbCard>
              )}

              <DbCard>
                <h2 className="m-0 mb-4 font-display text-[19px] font-semibold tracking-[-0.4px]">{tUi("attentionTitle")}</h2>
                {attentionItems.length === 0 ? (
                  <p className="m-0 text-[13px] text-[#6e6e6b]">{tUi("attention.none")}</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {attentionItems.map((item) => (
                      <div
                        key={item.title}
                        className="flex gap-3 rounded-[12px] border border-[#ecebe7] bg-[#fafaf8] p-3.5"
                        style={{ boxShadow: `inset 3px 0 0 ${item.tone}` }}
                      >
                        <span className="flex flex-col gap-0.5 pl-1">
                          <span className="text-[14px] font-semibold">{item.title}</span>
                          <span className="text-[13px] text-[#6e6e6b]">{item.text}</span>
                          {item.href && (
                            <Link href={item.href} className="mt-0.5 inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-[#6b4fc4] no-underline">
                              {item.link}
                              <ArrowRight size={13} />
                            </Link>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </DbCard>
            </div>

            {stats && (
              <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                <DbCard>
                  <h2 className="m-0 mb-3 font-display text-[18px] font-semibold tracking-[-0.4px]">{tUi("locationsTitle")}</h2>
                  {stats.locations.length === 0 && <p className="m-0 text-[13px] text-[#6e6e6b]">{tUi("noShifts")}</p>}
                  {stats.locations.slice(0, 4).map((location) => (
                    <div key={location.name} className="mb-2.5">
                      <span className="mb-1 flex justify-between text-[13.5px]">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2 rounded-[2px] bg-[#8b6ed4]" />
                          {location.name}
                        </span>
                        <strong className="font-semibold">{location.percent}%</strong>
                      </span>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-[#f2f1ed]">
                        <span className="block h-full rounded-full bg-[#8b6ed4]" style={{ width: `${location.percent}%` }} />
                      </span>
                    </div>
                  ))}
                </DbCard>
                <DbCard>
                  <h2 className="m-0 mb-3 font-display text-[18px] font-semibold tracking-[-0.4px]">{tUi("shiftTypesTitle")}</h2>
                  {stats.shiftTypes ? (
                    <>
                      <span className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                        {[
                          { value: stats.shiftTypes.early, color: "#e8a93c" },
                          { value: stats.shiftTypes.late, color: "#8b6ed4" },
                          { value: stats.shiftTypes.night, color: "#2f3e4e" },
                        ]
                          .filter((part) => part.value > 0)
                          .map((part) => (
                            <span key={part.color} style={{ flex: part.value, background: part.color }} />
                          ))}
                      </span>
                      <span className="mt-3 flex flex-wrap gap-4 text-[13px]">
                        {[
                          { label: tUi("early"), value: stats.shiftTypes.early, color: "#e8a93c" },
                          { label: tUi("late"), value: stats.shiftTypes.late, color: "#8b6ed4" },
                          { label: tUi("night"), value: stats.shiftTypes.night, color: "#2f3e4e" },
                        ].map((part) => (
                          <span key={part.label} className="inline-flex items-center gap-1.5 text-[#6e6e6b]">
                            <span className="size-2 rounded-full" style={{ background: part.color }} />
                            {part.label} <strong className="font-semibold text-ink">{part.value}%</strong>
                          </span>
                        ))}
                      </span>
                    </>
                  ) : (
                    <p className="m-0 text-[13px] text-[#6e6e6b]">{tUi("noShifts")}</p>
                  )}
                </DbCard>
                <DbCard>
                  <h2 className="m-0 mb-3 font-display text-[18px] font-semibold tracking-[-0.4px]">{tUi("punctualityTitle")}</h2>
                  {stats.punctualityPercent !== null ? (
                    <span className="flex items-baseline gap-2">
                      <span className="font-display text-[34px] leading-none font-semibold tracking-[-1px]">{stats.punctualityPercent} %</span>
                      <span className="text-[13px] text-[#6e6e6b]">{tUi("punctualHint")}</span>
                    </span>
                  ) : (
                    <p className="m-0 text-[13px] text-[#6e6e6b]">{tUi("noShifts")}</p>
                  )}
                  {stats.averageBreakMinutes !== null && (
                    <p className="m-0 mt-2 text-[13px] text-[#6e6e6b]">
                      {tUi("averageBreak", { minutes: stats.averageBreakMinutes })} ·{" "}
                      {stats.breaksOk ? tUi("breaksOk") : tUi("breaksShort")}
                    </p>
                  )}
                </DbCard>
              </div>
            )}
          </div>
        )}

        {isFilesTab && (
          <FilesTab
            employee={employee}
            tenant={tenant}
            employeeHref={employeeHref}
            uploadOptions={uploadOptions}
            canManageFiles={canManageFiles}
            canDeleteFiles={canDeleteFiles}
            activeFolder={activeFolder}
            t={t}
          />
        )}

        {activeTab === "payroll" && (
          <PayrollTab employee={employee} tenant={tenant} canManage={canManagePayrollStatements} t={t} />
        )}

        {isContractTab && (
          <ContractTab
            employee={employee}
            tenant={tenant}
            contracts={contracts as EmployeeContractItem[]}
            canManagePayroll={canManageContracts}
            locationOptions={locationOptions}
            t={t}
          />
        )}

        {activeTab === "absences" && absences && (
          <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            {absences.vacations !== null && (
              <DbCard>
                <h2 className="m-0 mb-3 font-display text-[18px] font-semibold tracking-[-0.4px]">{tUi("absences.vacationTitle")}</h2>
                {absences.vacations.length === 0 && <p className="m-0 text-[13px] text-[#6e6e6b]">{tUi("absences.none")}</p>}
                {absences.vacations.map((request) => {
                  const style = vacationStatus[request.status] ?? vacationStatus.pending;

                  return (
                    <div key={request.id} className="flex items-center justify-between gap-3 border-t border-[#ecebe7] py-2.5 first-of-type:border-t-0">
                      <span className="flex flex-col">
                        <span className="text-[14px] font-medium">
                          {formatDate(request.startDate)} – {formatDate(request.endDate)}
                        </span>
                        <span className="text-[12.5px] text-[#6e6e6b]">
                          {tUi("dayCount", { count: request.days })}
                          {request.note ? ` · ${request.note}` : ""}
                        </span>
                      </span>
                      <span className="rounded-[7px] px-2 py-[3px] text-[12px] font-medium" style={{ color: style.color, background: style.bg }}>
                        {style.label}
                      </span>
                    </div>
                  );
                })}
              </DbCard>
            )}
            {absences.sickness !== null && (
              <DbCard>
                <h2 className="m-0 mb-3 font-display text-[18px] font-semibold tracking-[-0.4px]">{tUi("absences.sicknessTitle")}</h2>
                {absences.sickness.length === 0 && <p className="m-0 text-[13px] text-[#6e6e6b]">{tUi("absences.none")}</p>}
                {absences.sickness.map((report) => (
                  <div key={report.id} className="flex items-center justify-between gap-3 border-t border-[#ecebe7] py-2.5 first-of-type:border-t-0">
                    <span className="flex flex-col">
                      <span className="text-[14px] font-medium">
                        {formatDate(report.startDate)} – {report.endDate ? formatDate(report.endDate) : tUi("absences.open")}
                      </span>
                      <span className="text-[12.5px] text-[#6e6e6b]">
                        {tUi("dayCount", { count: report.days })} · {tUi(`absences.certificate.${report.certificateStatus}`)}
                      </span>
                    </span>
                    <span
                      className={`rounded-[7px] px-2 py-[3px] text-[12px] font-medium ${report.status === "open" ? "bg-[rgba(180,51,42,0.08)] text-[#b4332a]" : "bg-[#f2f1ed] text-[#6e6e6b]"}`}
                    >
                      {report.status === "open" ? tUi("absences.sickOpen") : tUi("absences.sickClosed")}
                    </span>
                  </div>
                ))}
              </DbCard>
            )}
          </div>
        )}

        {activeTab === "times" && (
          <div className="flex flex-col gap-4">
            {timesView ? (
              <>
                <TimePeriodNav
                  basePath={employeeHref}
                  period={period}
                  range={timesView}
                  today={timesView.today}
                  extraParams={{ tab: "times" }}
                />
                <TimeTotals totals={timesView.totals} />
                <TimeEntriesDays days={timesView.days} today={timesView.today} />
              </>
            ) : (
              <DbCard>
                <p className="m-0 text-[13px] text-[#6e6e6b]">{tUi("noTimeTracking")}</p>
              </DbCard>
            )}
            <DbCard>
              <h2 className="m-0 mb-3 font-display text-[18px] font-semibold tracking-[-0.4px]">{t("shiftsThisWeek")}</h2>
              <div className="flex flex-col gap-2">
                {employee.shifts.map((shift) => (
                  <ShiftRow key={shift.day} shift={shift} />
                ))}
              </div>
            </DbCard>
          </div>
        )}

        {activeTab === "requests" && (
          <InfoRequestsCard employee={employee} tenant={tenant} employeeHandle={employee.id} canManage={canEditEmployee} t={t} />
        )}

        {activeTab === "log" && (
          <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            <DetailCard title={t("historyTitle")} className="[&>h2]:mb-4">
              {employee.timeline.map((item, index) => (
                <TimelineItem key={`${item.title}-${item.date}`} item={item} isLast={index === employee.timeline.length - 1} />
              ))}
            </DetailCard>
            {canViewEmployeeAudit && <AuditLogPanel entries={auditEntries} />}
          </div>
        )}

        {isDataTab && (
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
                  <LocationMultiSelectDropdown
                    defaultLocations={employee.teams?.length ? employee.teams : employee.team ? [employee.team] : []}
                    options={teamOptions}
                    name="teams"
                    label={t("team")}
                    placeholder={t("selectTeams")}
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
                  <FieldValue
                    label={t("team")}
                    value={employee.teams?.length ? employee.teams.join(", ") : employee.team}
                  />
                  <FieldValue label={t("permissionRole")} value={employee.role} />
                </div>
              )}
            </DetailCard>

            <DetailCard title={t("vacationTitle")}>
              {isEditing ? (
                <div className="flex flex-col gap-3">
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
                    <FieldValue label={t("vacationTotalField")} value={employee.vacationTotal} />
                    <FieldValue label={t("vacationTakenField")} value={employee.vacationTaken} />
                    <FieldValue label={t("vacationCarryoverField")} value={employee.vacationCarryover} />
                    <EditableTextField
                      id="employee-vacation-correction"
                      label={t("vacationManualCorrectionField")}
                      name="vacationManualCorrection"
                      type="number"
                      value={employee.vacationManualCorrection}
                    />
                  </div>
                  <p className="text-[12px] text-muted -mt-1">
                    {t("vacationManualCorrectionHint")}
                  </p>
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

            
            </div>
          </div>
        </div>
        )}

        {deletionEligibility && activeTab === "log" && (
          <div className="mt-5">
            <DetailCard title={t("retentionTitle")}>
              <p className="mb-4 text-[13px] leading-[1.55] text-muted-2">{t("retentionDescription")}</p>
              <form id="employee-retention-form" className="flex flex-col gap-2">
                <input type="hidden" name="tenant" value={tenant} />
                <input type="hidden" name="employeeId" value={employee.dbId ?? ""} />
                <input type="hidden" name="employeeHandle" value={employee.id} />
                {deletionEligibility.map((entry: CategoryEligibility) => (
                  <label
                    key={entry.category}
                    className={`flex items-start gap-2.5 rounded-btn border px-3 py-2.5 text-[13px] ${
                      entry.eligible ? "border-danger/25 bg-danger/5" : "border-border-light bg-bg text-muted-2"
                    }`}
                  >
                    <input type="checkbox" name="categories" value={entry.category} disabled={!entry.eligible} className="mt-0.5" />
                    <span>
                      <span className="font-semibold text-ink">{RETENTION_POLICIES[entry.category].beschreibung}</span>
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
      </EmployeeEditFormAndBar>
    </>
  );
}
