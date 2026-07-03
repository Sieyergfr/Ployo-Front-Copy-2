import { DataTableStatus } from "@/components/DataTable";
import AuditLogPanel from "@/components/AuditLogPanel";
import { FileReminderButton } from "@/components/ActionDrawers";
import EmployeeInfoRequestButton from "@/components/EmployeeInfoRequestButton";
import { ConfirmedSaveLink, UnsavedChangesGuard } from "@/components/EditSafety";
import { makeAuditLogs } from "@/lib/audit";
import {
  employeeStatusConfig,
  getEmployeeById,
  type EmployeeStatus,
  type Employee,
  type EmployeeFile,
  type EmployeeFileFolder,
  type EmployeeTimelineItem,
} from "@/lib/employees";
import {
  ArrowLeft,
  AlertTriangle,
  BriefcaseBusiness,
  Eye,
  FileText,
  Folder,
  FolderPlus,
  Lock,
  MessageSquare,
  Pencil,
  X,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export async function generateMetadata({
  params,
}: PageProps<"/u/[tenant]/employees/[employeeId]">) {
  const { employeeId } = await params;
  const employee = getEmployeeById(employeeId);

  return {
    title: employee?.name ?? "Mitarbeiter",
  };
}

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

function EmergencyContactsCard({
  employee,
  isEditing,
}: {
  employee: Employee;
  isEditing: boolean;
}) {
  return (
    <DetailCard
      title={
        <span className="flex items-center gap-2 text-danger">
          <AlertTriangle size={17} />
          Notfallkontakte
        </span>
      }
      className="border-danger/25 bg-danger/5 [&>h2]:mb-3.5"
    >
      <div className="grid gap-2.5">
        {employee.emergencyContacts.map((contact, index) => (
          <div
            key={contact.id}
            className="rounded-xl border border-danger/20 bg-white p-3"
          >
            {isEditing ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="input bg-white"
                  aria-label={`Notfallkontakt ${index + 1} Name`}
                  defaultValue={contact.name}
                />
                <input
                  className="input bg-white"
                  aria-label={`Notfallkontakt ${index + 1} Beziehung`}
                  defaultValue={contact.relation}
                />
                <input
                  className="input input-mono bg-white"
                  aria-label={`Notfallkontakt ${index + 1} Telefon`}
                  defaultValue={contact.phone}
                />
                <input
                  className="input bg-white"
                  aria-label={`Notfallkontakt ${index + 1} E-Mail`}
                  defaultValue={contact.email ?? ""}
                  placeholder="E-Mail optional"
                />
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-semibold text-ink">
                      {contact.name}
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      {contact.relation}
                    </div>
                  </div>
                  <div className="font-mono text-[12px] font-semibold text-danger">
                    {contact.phone}
                  </div>
                </div>
                {contact.note && (
                  <div className="mt-2 text-[12px] text-muted-2">{contact.note}</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {isEditing && (
        <button type="button" className="btn btn-secondary btn-sm mt-3">
          Kontakt hinzufügen
        </button>
      )}
    </DetailCard>
  );
}

function PayrollTab({ employee }: { employee: Employee }) {
  return (
    <DetailCard title="Gehaltsabrechnungen" className="[&>h2]:mb-3.5">
      {employee.payrollStatements.map((statement) => (
        <div
          key={statement.id}
          className="grid gap-3 border-t border-border-soft py-3.5 sm:grid-cols-[1fr_150px_150px_120px]"
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
            Brutto {statement.gross}
          </div>
          <div className="font-mono text-[12px] text-ink">
            Netto {statement.net}
          </div>
          <span className="h-fit rounded-[7px] border border-border-light px-2 py-[3px] text-center font-mono text-[10px] text-muted-2">
            {statement.status === "corrected" ? "Korrigiert" : "Verfügbar"}
          </span>
        </div>
      ))}
    </DetailCard>
  );
}

function InfoRequestsCard({ employee }: { employee: Employee }) {
  return (
    <DetailCard title="Info-Anfragen" className="[&>h2]:mb-3.5">
      {employee.infoRequests.map((request) => (
        <div key={request.id} className="border-t border-border-soft py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-ink">
                {request.title}
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-muted">
                {request.requestedBy} · {request.requestedAt}
              </div>
            </div>
            <span className="rounded-[7px] bg-border-soft px-2 py-[3px] font-mono text-[10px] text-muted-2">
              bis {request.dueAt}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {request.fileRequested && (
              <span className="rounded-[7px] border border-border-light px-2 py-[3px] font-mono text-[10px] text-muted">
                Datei gewünscht
              </span>
            )}
            <span className="rounded-[7px] border border-border-light px-2 py-[3px] font-mono text-[10px] text-muted">
              {request.status === "uploaded" ? "Upload erhalten" : "Offen"}
            </span>
          </div>
        </div>
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
}: {
  id: string;
  label: string;
  name: string;
  value: string | number;
  type?: "text" | "email" | "tel" | "number";
  mono?: boolean;
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
      />
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

function DocumentRow({ document }: { document: Employee["documents"][number] }) {
  return (
    <div className="flex items-center gap-3.5 border-t border-border-soft py-3">
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
        <FileText size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-ink">
          {document.title}
        </div>
        <div className="mt-0.5 font-mono text-[10.5px] text-muted">
          {document.meta}
        </div>
      </div>
      <span className="whitespace-nowrap rounded-[7px] border border-success px-2 py-[3px] font-mono text-[10px] text-success">
        {document.state}
      </span>
    </div>
  );
}

function FileFolderCard({ folder }: { folder: EmployeeFileFolder }) {
  return (
    <div className="flex w-full cursor-pointer items-center gap-[13px] rounded-xl border border-border bg-white p-[15px] text-left font-sans transition-colors hover:bg-bg">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
        <Folder size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-ink">
          {folder.name}
        </span>
        <span className="mt-[3px] block font-mono text-[10.5px] text-muted">
          {folder.fileCount} Dateien
        </span>
      </span>
      {folder.locked && <Lock size={13} className="shrink-0 text-muted" />}
      <FileReminderButton
        compact
        name={folder.name}
        context={`Mitarbeiterordner \u00b7 ${folder.name}`}
      />
    </div>
  );
}

function FileRow({ file }: { file: EmployeeFile }) {
  return (
    <div className="flex w-full cursor-pointer items-center gap-3.5 border-t border-border-soft py-3 text-left font-sans transition-colors hover:bg-bg">
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
        <FileText size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">
          {file.name}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted">
          {file.folder} {"\u00b7"} {file.updatedAt}
        </span>
      </span>
      <span className="hidden font-mono text-[10.5px] text-muted md:block">
        {file.size}
      </span>
      <span className="rounded-[7px] border border-border-light px-2 py-[3px] font-mono text-[10px] text-muted-2">
        {file.type}
      </span>
      {file.locked && <Lock size={13} className="shrink-0 text-muted" />}
      <FileReminderButton
        compact
        name={file.name}
        context={`${file.folder} \u00b7 Mitarbeiterdatei`}
      />
    </div>
  );
}

function FilesTab({ employee }: { employee: Employee }) {
  return (
    <DetailCard
      title={
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
            <Folder size={18} />
          </span>
          <span className="min-w-0">
            <span className="block truncate">Dateiablage</span>
            <span className="mt-[3px] block font-mono text-[10.5px] font-normal tracking-normal text-muted">
              Ordner und Dateien
            </span>
          </span>
        </div>
      }
      className="[&>h2]:mb-4"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[10.5px] text-muted">
          {employee.fileFolders.length} Ordner {"\u00b7"} {employee.files.length}{" "}
          Dateien
        </span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm">
            <FolderPlus size={14} />
            Ordner erstellen
          </button>
          <button type="button" className="btn btn-primary btn-sm">
            <Upload size={14} />
            Datei hochladen
          </button>
        </div>
      </div>

      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        {employee.fileFolders.map((folder) => (
          <FileFolderCard key={folder.name} folder={folder} />
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
          Dateien
        </div>
        {employee.files.map((file) => (
          <FileRow key={`${file.folder}-${file.name}`} file={file} />
        ))}
      </div>
    </DetailCard>
  );
}

function ContractDocumentCard({
  employee,
  fileHref,
}: {
  employee: Employee;
  fileHref: string;
}) {
  const contract = employee.contractDetails;

  return (
    <DetailCard title="Vertragsdatei" className="[&>h2]:mb-3.5">
      <div className="rounded-xl border border-border bg-bg p-4">
        <div className="flex items-start gap-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-white text-muted-2">
            <FileText size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-ink">
              {contract.linkedFileName}
            </div>
            <div className="mt-1 block truncate font-mono text-[10.5px] text-muted">
              {contract.linkedFileMeta}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-[0.5px] text-muted">
              <span className="rounded-[7px] border border-border-light bg-white px-2 py-[5px]">
                PDF
              </span>
              <span className="rounded-[7px] border border-border-light bg-white px-2 py-[5px]">
                Verknüpft
              </span>
            </div>
          </div>
        </div>
        <Link href={fileHref} className="btn btn-primary btn-sm mt-4 w-full justify-center">
          <Eye size={14} />
          Öffnen
        </Link>
      </div>
    </DetailCard>
  );
}

function ContractTab({
  employee,
  isEditing,
  fileHref,
}: {
  employee: Employee;
  isEditing: boolean;
  fileHref: string;
}) {
  const contract = employee.contractDetails;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_0.9fr]">
      <div className="flex flex-col gap-4">
        <DetailCard
          title={
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
                <BriefcaseBusiness size={18} />
              </span>
              <span className="min-w-0">
                <span className="block truncate">Vertragsdetails</span>
                <span className="mt-[3px] block font-mono text-[10.5px] font-normal tracking-normal text-muted">
                  Arbeitsvertrag und Eckdaten
                </span>
              </span>
            </div>
          }
          className="[&>h2]:mb-4"
        >
          {isEditing ? (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
              <EditableTextField
                id="contract-type"
                label="Vertragsart"
                name="contractType"
                value={contract.contractType}
              />
              <EditableTextField
                id="contract-entry-date"
                label="Eintritt"
                name="entryDate"
                value={contract.entryDate}
                mono
              />
              <EditableTextField
                id="contract-exit-date"
                label="Austritt"
                name="exitDate"
                value={contract.exitDate}
                mono
              />
              <EditableTextField
                id="contract-fixed-term"
                label="Befristung"
                name="fixedTerm"
                value={contract.fixedTerm}
              />
              <EditableTextField
                id="contract-probation"
                label="Probezeit"
                name="probation"
                value={contract.probation}
              />
              <EditableTextField
                id="contract-notice-period"
                label="Kündigungsfrist"
                name="noticePeriod"
                value={contract.noticePeriod}
              />
            </div>
          ) : (
            <div className="grid gap-y-[18px] gap-x-[22px] [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
              <FieldValue label="Vertragsart" value={contract.contractType} />
              <FieldValue label="Eintritt" value={contract.entryDate} mono />
              <FieldValue label="Austritt" value={contract.exitDate} mono />
              <FieldValue label="Befristung" value={contract.fixedTerm} />
              <FieldValue label="Probezeit" value={contract.probation} />
              <FieldValue label="Kündigungsfrist" value={contract.noticePeriod} />
            </div>
          )}
        </DetailCard>

        <DetailCard title="Position & Organisation">
          {isEditing ? (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
              <EditableTextField
                id="contract-position"
                label="Position / Stelle"
                name="position"
                value={contract.position}
              />
              <EditableTextField
                id="contract-department"
                label="Abteilung"
                name="department"
                value={contract.department}
              />
              <EditableTextField
                id="contract-supervisor"
                label="Vorgesetzter"
                name="supervisor"
                value={contract.supervisor}
              />
              <EditableTextField
                id="contract-work-location"
                label="Ort"
                name="workLocation"
                value={contract.workLocation}
              />
              <EditableTextField
                id="contract-parties"
                label="Parteien"
                name="parties"
                value={contract.parties}
              />
              <EditableTextField
                id="contract-collective-agreement"
                label="Tarif / Regelwerk"
                name="collectiveAgreement"
                value={contract.collectiveAgreement}
              />
            </div>
          ) : (
            <div className="grid gap-y-[18px] gap-x-[22px] [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
              <FieldValue label="Position / Stelle" value={contract.position} />
              <FieldValue label="Abteilung" value={contract.department} />
              <FieldValue label="Vorgesetzter" value={contract.supervisor} />
              <FieldValue label="Ort" value={contract.workLocation} />
              <FieldValue label="Parteien" value={contract.parties} />
              <FieldValue
                label="Tarif / Regelwerk"
                value={contract.collectiveAgreement}
              />
            </div>
          )}
        </DetailCard>
      </div>

      <div className="flex flex-col gap-4">
        <DetailCard title="Konditionen">
          {isEditing ? (
            <div className="grid gap-3">
              <EditableTextField
                id="contract-compensation"
                label="Vergütung"
                name="compensation"
                value={contract.compensation}
              />
              <EditableTextField
                id="contract-working-time"
                label="Arbeitszeit"
                name="workingTime"
                value={contract.workingTime}
              />
              <EditableTextField
                id="contract-vacation"
                label="Urlaub"
                name="vacation"
                value={contract.vacation}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <FieldValue label="Vergütung" value={contract.compensation} />
              <FieldValue label="Arbeitszeit" value={contract.workingTime} />
              <FieldValue label="Urlaub" value={contract.vacation} />
            </div>
          )}
        </DetailCard>

        <ContractDocumentCard employee={employee} fileHref={fileHref} />
      </div>
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
  const { tab, edit } = await searchParams;
  const employee = getEmployeeById(employeeId);

  if (!employee) {
    notFound();
  }

  const status = employeeStatusConfig[employee.status];
  const isFilesTab = tab === "files";
  const isContractTab = tab === "contract";
  const isPayrollTab = tab === "payroll";
  const isHomeTab = !isFilesTab && !isContractTab && !isPayrollTab;
  const isEditableTab = isHomeTab || isContractTab;
  const isEditing = edit === "1" && isEditableTab;
  const employeeHref = `/u/${tenant}/employees/${employee.id}`;
  const activeTabHref = isContractTab ? `${employeeHref}?tab=contract` : employeeHref;
  const employeeFilesHref = `${employeeHref}?tab=files`;
  const auditEntries = makeAuditLogs({
    id: employee.id,
    name: employee.name,
    source: "Mitarbeiterakte",
  });
  const employeeEditHref = isContractTab
    ? `${employeeHref}?tab=contract&edit=1`
    : `${employeeHref}?edit=1`;
  const vacationPercent = Math.round(
    (employee.vacationTaken / employee.vacationTotal) * 100,
  );
  const statusOptions: EmployeeStatus[] = ["active", "vacation", "absent"];

  return (
    <>
      <UnsavedChangesGuard active={isEditing} />
      <div className="mb-[22px] flex flex-wrap items-center gap-3.5">
        <Link href={`/u/${tenant}/employees`} className="btn btn-secondary btn-sm">
          <ArrowLeft size={14} />
          Mitarbeiter
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-[0.5px] text-muted">
          Personalakte / {employee.employeeNumber}
        </span>
      </div>

      <section className="mb-4 flex flex-wrap items-center gap-[22px] rounded-card border border-border bg-white p-7">
        <span className="flex size-[72px] shrink-0 items-center justify-center rounded-full bg-ink text-[24px] font-semibold text-white">
          {employee.initials}
        </span>

        <div className="min-w-[200px] flex-1">
          <h1 className="m-0 font-display text-[clamp(26px,3vw,34px)] font-semibold leading-[1.05] tracking-[-1px] text-ink">
            {employee.name}
          </h1>
          <div className="mt-[7px] text-[14px] text-muted-2">
            {employee.role} {"\u00b7"} {employee.team} {"\u00b7"}{" "}
            {employee.location}
          </div>
          <div className="mt-[11px] flex flex-wrap items-center gap-3">
            <DataTableStatus label={status.label} tone={status.tone} />
            <span className="font-mono text-[12px] text-muted">
              {employee.employeeNumber}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-[9px]">
          {isEditing ? (
            <>
              <Link href={activeTabHref} className="btn btn-secondary btn-sm">
                <X size={14} />
                Abbrechen
              </Link>
              <ConfirmedSaveLink href={activeTabHref} />
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-sm">
                <MessageSquare size={14} />
                Nachricht senden
              </button>
              <EmployeeInfoRequestButton employeeName={employee.name} />
              <Link href={employeeEditHref} className="btn btn-secondary btn-sm">
                <Pencil size={14} />
                Bearbeiten
              </Link>
            </>
          )}
        </div>
      </section>

      <div className="mb-5 flex gap-[26px] border-b border-border">
        <Link
          href={employeeHref}
          className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
            isHomeTab
              ? "border-ink font-semibold text-ink"
              : "border-transparent font-medium text-muted"
          }`}
        >
          Home
        </Link>
        <Link
          href={`${employeeHref}?tab=contract`}
          className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
            isContractTab
              ? "border-ink font-semibold text-ink"
              : "border-transparent font-medium text-muted"
          }`}
        >
          Vertrag
          <span className="font-mono text-[11px] text-muted">1</span>
        </Link>
        <Link
          href={`${employeeHref}?tab=files`}
          className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
            isFilesTab
              ? "border-ink font-semibold text-ink"
              : "border-transparent font-medium text-muted"
          }`}
        >
          Dateien
          <span className="font-mono text-[11px] text-muted">
            {employee.files.length + employee.fileFolders.length}
          </span>
        </Link>
        <Link
          href={`${employeeHref}?tab=payroll`}
          className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
            isPayrollTab
              ? "border-ink font-semibold text-ink"
              : "border-transparent font-medium text-muted"
          }`}
        >
          Abrechnungen
          <span className="font-mono text-[11px] text-muted">
            {employee.payrollStatements.length}
          </span>
        </Link>
      </div>

      {isFilesTab ? (
        <FilesTab employee={employee} />
      ) : isPayrollTab ? (
        <PayrollTab employee={employee} />
      ) : isContractTab ? (
        <ContractTab
          employee={employee}
          isEditing={isEditing}
          fileHref={employeeFilesHref}
        />
      ) : (
        <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          <div className="flex flex-col gap-4">
            <DetailCard title="Stamminformationen">
              {isEditing ? (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                  <EditableTextField
                    id="employee-number"
                    label="Personalnummer"
                    name="employeeNumber"
                    value={employee.employeeNumber}
                    mono
                  />
                  <EditableTextField
                    id="employee-birth-date"
                    label="Geburtsdatum"
                    name="birthDate"
                    value={employee.birthDate}
                    mono
                  />
                  <EditableTextField
                    id="employee-birth-place"
                    label="Geburtsort"
                    name="birthPlace"
                    value={employee.birthPlace}
                  />
                  <EditableTextField
                    id="employee-nationality"
                    label="Nationalität"
                    name="nationality"
                    value={employee.nationality}
                  />
                  <EditableTextField
                    id="employee-marital-status"
                    label="Familienstand"
                    name="maritalStatus"
                    value={employee.maritalStatus}
                  />
                  <EditableTextField
                    id="employee-private-address"
                    label="Anschrift"
                    name="privateAddress"
                    value={employee.privateAddress}
                  />
                  <EditableTextField
                    id="employee-master-email"
                    label="E-Mail"
                    name="email"
                    type="email"
                    value={employee.email}
                    mono
                  />
                  <EditableTextField
                    id="employee-master-phone"
                    label="Telefon"
                    name="phone"
                    type="tel"
                    value={employee.phone}
                    mono
                  />
                  <EditableTextField
                    id="employee-tax-id"
                    label="Steuer-ID"
                    name="taxId"
                    value={employee.taxId}
                    mono
                  />
                  <EditableTextField
                    id="employee-social-security-number"
                    label="Sozialversicherungsnummer"
                    name="socialSecurityNumber"
                    value={employee.socialSecurityNumber}
                    mono
                  />
                  <EditableTextField
                    id="employee-health-insurance"
                    label="Krankenkasse"
                    name="healthInsurance"
                    value={employee.healthInsurance}
                  />
                  <EditableTextField
                    id="employee-iban"
                    label="IBAN"
                    name="iban"
                    value={employee.iban}
                    mono
                  />
                </div>
              ) : (
                <div className="grid gap-y-[18px] gap-x-[22px] [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
                  <FieldValue
                    label="Personalnummer"
                    value={employee.employeeNumber}
                    mono
                  />
                  <FieldValue
                    label="Geburtsdatum"
                    value={employee.birthDate}
                    mono
                  />
                  <FieldValue label="Geburtsort" value={employee.birthPlace} />
                  <FieldValue label="Nationalität" value={employee.nationality} />
                  <FieldValue label="Familienstand" value={employee.maritalStatus} />
                  <FieldValue label="Anschrift" value={employee.privateAddress} />
                  <FieldValue label="E-Mail" value={employee.email} mono />
                  <FieldValue label="Telefon" value={employee.phone} mono />
                  <FieldValue label="Steuer-ID" value={employee.taxId} mono />
                  <FieldValue
                    label="Sozialversicherungsnummer"
                    value={employee.socialSecurityNumber}
                    mono
                  />
                  <FieldValue
                    label="Krankenkasse"
                    value={employee.healthInsurance}
                  />
                  <FieldValue label="IBAN" value={employee.iban} mono />
                </div>
              )}
            </DetailCard>

            <DetailCard title={"Besch\u00e4ftigung"}>
              {isEditing ? (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                  <EditableSelectField
                    id="employee-contract"
                    label="Vertragsart"
                    name="contract"
                    value={employee.contract}
                    options={[
                      "Unbefristet",
                      "Teilzeit",
                      "Befristet",
                      "Werkstudentin",
                    ]}
                  />
                  <EditableTextField
                    id="employee-weekly-hours"
                    label="Wochenstunden"
                    name="weeklyHours"
                    value={employee.weeklyHours}
                  />
                  <EditableTextField
                    id="employee-start-date"
                    label="Eintrittsdatum"
                    name="startDate"
                    value={employee.startDate}
                    mono
                  />
                  <EditableTextField
                    id="employee-tenure"
                    label="Beschäftigt seit"
                    name="tenure"
                    value={employee.tenure}
                  />
                  <EditableSelectField
                    id="employee-team"
                    label="Team"
                    name="team"
                    value={employee.team}
                    options={["Verkauf", "Logistik", "Service", "Empfang"]}
                  />
                  <EditableTextField
                    id="employee-role"
                    label="Rolle"
                    name="role"
                    value={employee.role}
                  />
                  <EditableSelectField
                    id="employee-status"
                    label="Status"
                    name="status"
                    value={employee.status}
                    options={statusOptions}
                  />
                </div>
              ) : (
                <div className="grid gap-y-[18px] gap-x-[22px] [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
                  <FieldValue label="Vertragsart" value={employee.contract} />
                  <FieldValue label="Wochenstunden" value={employee.weeklyHours} />
                  <FieldValue
                    label="Eintrittsdatum"
                    value={employee.startDate}
                    mono
                  />
                  <FieldValue
                    label={"Besch\u00e4ftigt seit"}
                    value={employee.tenure}
                  />
                  <FieldValue label="Team" value={employee.team} />
                  <FieldValue label="Rolle" value={employee.role} />
                </div>
              )}
            </DetailCard>

            <DetailCard title="Abwesenheit & Urlaub">
              {isEditing ? (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
                  <EditableTextField
                    id="employee-vacation-remaining"
                    label="Resturlaub"
                    name="vacationRemaining"
                    type="number"
                    value={employee.vacationRemaining}
                  />
                  <EditableTextField
                    id="employee-vacation-total"
                    label="Urlaub gesamt"
                    name="vacationTotal"
                    type="number"
                    value={employee.vacationTotal}
                  />
                  <EditableTextField
                    id="employee-vacation-taken"
                    label="Genommen"
                    name="vacationTaken"
                    type="number"
                    value={employee.vacationTaken}
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-2">
                    <span className="font-display text-[38px] font-semibold leading-none tracking-[-1.5px] text-ink">
                      {employee.vacationRemaining}
                    </span>
                    <span className="mb-[5px] text-[13px] text-muted">
                      von {employee.vacationTotal} Tagen Resturlaub
                    </span>
                  </div>
                  <div className="my-4 h-2 overflow-hidden rounded-full bg-border-soft">
                    <div
                      className="h-full rounded-full bg-ink"
                      style={{ width: `${vacationPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between font-mono text-[11px] text-muted">
                    <span>{employee.vacationTaken} Tage genommen</span>
                    <span>{vacationPercent}%</span>
                  </div>
                </>
              )}
            </DetailCard>

            <DetailCard title="Dokumente" className="[&>h2]:mb-3.5">
              {employee.documents.map((document) => (
                <DocumentRow key={document.title} document={document} />
              ))}
            </DetailCard>

            <DetailCard title="Schichten diese Woche" className="[&>h2]:mb-3.5">
              <div className="flex flex-col gap-2">
                {employee.shifts.map((shift) => (
                  <ShiftRow key={shift.day} shift={shift} />
                ))}
              </div>
            </DetailCard>

            <InfoRequestsCard employee={employee} />
          </div>

          <div className="flex flex-col gap-4">
            <EmergencyContactsCard employee={employee} isEditing={isEditing} />

            <DetailCard title="Kontakt">
              {isEditing ? (
                <div className="grid gap-3">
                  <EditableTextField
                    id="employee-email"
                    label="E-Mail"
                    name="email"
                    type="email"
                    value={employee.email}
                    mono
                  />
                  <EditableTextField
                    id="employee-phone"
                    label="Telefon"
                    name="phone"
                    type="tel"
                    value={employee.phone}
                    mono
                  />
                  <EditableTextField
                    id="employee-address"
                    label="Standort-Adresse"
                    name="address"
                    value={employee.address}
                  />
                  <EditableSelectField
                    id="employee-location"
                    label="Standort"
                    name="location"
                    value={employee.location}
                    options={["München", "Berlin", "Hamburg"]}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <FieldValue label="E-Mail" value={employee.email} mono />
                  <FieldValue label="Telefon" value={employee.phone} mono />
                  <FieldValue label="Standort-Adresse" value={employee.address} />
                </div>
              )}
            </DetailCard>

            <DetailCard title="Verlauf" className="[&>h2]:mb-4">
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
      )}

      <div className="mt-4">
        <AuditLogPanel entries={auditEntries} />
      </div>

      <div className="mt-8 text-center font-mono text-[10px] tracking-[0.4px] text-[#B0B0AB]">
        Ployo {"\u00b7"} Personalakte-System {"\u00b7"} Alle Zugriffe
        protokolliert {"\u00b7"} Server in Frankfurt
      </div>
    </>
  );
}
