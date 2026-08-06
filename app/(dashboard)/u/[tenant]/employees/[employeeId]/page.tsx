import { DataTableStatus } from "@/components/DataTable";
import AddressFields from "@/components/AddressFields";
import AuditLogPanel from "@/components/AuditLogPanel";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import DatePickerField from "@/components/DatePickerField";
import {
  CreateFolderButton,
  UploadFileButton,
} from "@/components/FileActionButtons";
import { FileReminderButton } from "@/components/ActionDrawers";
import EmployeeContracts, { type EmployeeContractItem } from "@/components/EmployeeContracts";
import EmployeeInfoRequestButton from "@/components/EmployeeInfoRequestButton";
import { UnsavedChangesGuard } from "@/components/EditSafety";
import FloatingEditBar from "@/components/FloatingEditBar";
import {
  deleteEmployeeAction,
  inviteEmployeeAction,
  updateEmployeeAction,
} from "@/app/(dashboard)/u/[tenant]/employees/actions";
import { getAuditLogsForEntity } from "@/lib/audit";
import { getEmployeeForTenant } from "@/lib/employee-service";
import { getInvitationStatusForEmail } from "@/lib/invitation-service";
import { getEmployeeContracts } from "@/lib/contract-service";
import {
  CONTRACT_FILE_NOT_UPLOADED,
  employeeStatusConfig,
  type EmployeeStatus,
  type Employee,
  type EmployeeFile,
  type EmployeeFileFolder,
  type EmployeeTimelineItem,
} from "@/lib/employees";
import { getRolesForTenant } from "@/lib/role-service";
import {
  ArrowLeft,
  AlertTriangle,
  BriefcaseBusiness,
  Eye,
  FileText,
  Folder,
  Lock,
  MessageSquare,
  Pencil,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getFileUploadOptions } from "@/lib/files-server";
import { type FileFolder, type FileUploadOptions } from "@/lib/files";

export async function generateMetadata({
  params,
}: PageProps<"/u/[tenant]/employees/[employeeId]">) {
  const { tenant, employeeId } = await params;
  const employee = await getEmployeeForTenant(tenant, employeeId);

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

function InfoRequestsCard({
  employee,
  tenant,
  employeeHandle,
}: {
  employee: Employee;
  tenant: string;
  employeeHandle: string;
}) {
  return (
    <DetailCard
      title={
        <span className="flex flex-wrap items-center justify-between gap-2">
          Info-Anfragen
          <EmployeeInfoRequestButton
            tenant={tenant}
            employeeId={employee.dbId ?? ""}
            employeeHandle={employeeHandle}
            employeeName={employee.name}
          />
        </span>
      }
      className="[&>h2]:mb-3.5"
    >
      {employee.infoRequests.length === 0 && (
        <p className="border-t border-border-soft pt-3 text-[12.5px] text-muted">
          Noch keine Info-Anfragen erfasst.
        </p>
      )}
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

function FileFolderCard({
  folder,
  tenant,
  returnPath,
}: {
  folder: EmployeeFileFolder;
  tenant: string;
  returnPath: string;
}) {
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
        tenant={tenant}
        returnPath={returnPath}
        compact
        name={folder.name}
        context={`Mitarbeiterordner \u00b7 ${folder.name}`}
      />
    </div>
  );
}

function FileRow({
  file,
  tenant,
  returnPath,
}: {
  file: EmployeeFile;
  tenant: string;
  returnPath: string;
}) {
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
        tenant={tenant}
        returnPath={returnPath}
        compact
        name={file.name}
        context={`${file.folder} \u00b7 Mitarbeiterdatei`}
      />
    </div>
  );
}

function folderOptionSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function employeeFolderOptions(employee: Employee): FileFolder[] {
  return employee.fileFolders.map((folder) => ({
    slug: folder.path ?? folderOptionSlug(folder.name),
    path: folder.path ?? folderOptionSlug(folder.name),
    name: folder.name,
    fileCount: folder.fileCount,
    owner: "HR",
    updatedAt: "",
    locked: folder.locked,
  }));
}

function FilesTab({
  employee,
  tenant,
  employeeHref,
  uploadOptions,
}: {
  employee: Employee;
  tenant: string;
  employeeHref: string;
  uploadOptions: FileUploadOptions;
}) {
  const folderOptions = employeeFolderOptions(employee);

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
          <CreateFolderButton
            tenant={tenant}
            returnPath={`${employeeHref}?tab=files`}
            ownerType="employee"
            ownerId={employee.dbId}
          />
          <UploadFileButton
            tenant={tenant}
            returnPath={`${employeeHref}?tab=files`}
            ownerType="employee"
            ownerId={employee.dbId}
            folderOptions={folderOptions}
            uploadOptions={uploadOptions}
          />
        </div>
      </div>

      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        {employee.fileFolders.map((folder) => (
            <FileFolderCard
              key={folder.name}
              folder={folder}
              tenant={tenant}
              returnPath={`${employeeHref}?tab=files`}
            />
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
          Dateien
        </div>
        {employee.files.map((file) => (
            <FileRow
              key={`${file.folder}-${file.name}`}
              file={file}
              tenant={tenant}
              returnPath={`${employeeHref}?tab=files`}
            />
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
}: {
  employeeName: string;
  href: string;
}) {
  return (
    <section className="rounded-card border border-warning/30 bg-[#FFF7EA] px-5 py-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-warning">
          <BriefcaseBusiness size={18} />
        </span>
        <div className="min-w-[220px] flex-1">
          <div className="text-[14px] font-semibold text-ink">
            Vertragsdetails fehlen
          </div>
          <p className="mt-1 text-[12.5px] leading-5 text-muted-2">
            Ergänze Vertragsdetails für {employeeName}, damit Fristen,
            Arbeitszeit und Konditionen vollständig in der Personalakte stehen.
          </p>
        </div>
        <Link href={href} className="btn btn-primary btn-sm">
          Vertragsdetails einfügen
        </Link>
      </div>
    </section>
  );
}

// Kept temporarily as a reference while legacy JSON contract fields are migrated.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyContractTab({
  employee,
  isEditing,
  fileHref,
  roleOptions,
}: {
  employee: Employee;
  isEditing: boolean;
  fileHref: string;
  roleOptions: string[];
}) {
  const contract = employee.contractDetails;
  const contractHistory = [
    {
      id: "current",
      title: contract.contractType || employee.contract,
      status: "Aktiv",
      period: `${contract.entryDate || employee.startDate || "ohne Start"} - ${contract.exitDate || "laufend"}`,
      meta: contract.linkedFileMeta || "Keine Datei verknuepft",
    },
    {
      id: "previous",
      title: "Vorherige Vertragsfassung",
      status: "Ersetzt",
      period: "01.01.2025 - 31.12.2025",
      meta: "Archiviert im Vertragsverlauf",
    },
    {
      id: "inactive",
      title: "Nebenvereinbarung Arbeitszeit",
      status: "Inaktiv",
      period: "01.06.2024 - 31.12.2024",
      meta: "Inaktiv gesetzt, bleibt fuer die Historie erhalten",
    },
  ];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      {isEditing && <input type="hidden" name="contractDetailsSubmitted" value="1" />}
      <div className="flex flex-col gap-4">
        <DetailCard
          title={
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
                <BriefcaseBusiness size={18} />
              </span>
              <span className="min-w-0">
                <span className="block truncate">Aktueller Vertrag</span>
                <span className="mt-[3px] block font-mono text-[10.5px] font-normal tracking-normal text-muted">
                  Datei, Status und Eckdaten
                </span>
              </span>
            </div>
          }
          className="[&>h2]:mb-4"
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm">
              Vertrag hinzufuegen
            </button>
            <button type="button" className="btn btn-secondary btn-sm">
              Vertrag ersetzen
            </button>
            <button type="button" className="btn btn-secondary btn-sm">
              Inaktiv setzen
            </button>
            <button type="button" className="btn btn-secondary btn-sm text-danger">
              Aufheben / kuendigen
            </button>
          </div>
          {isEditing ? (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
              <EditableTextField
                id="contract-type"
                label="Vertragsart"
                name="contractType"
                value={contract.contractType}
              />
              <EditableSelectField
                id="contract-permission-role"
                label="Berechtigungsrolle"
                name="role"
                value={employee.role}
                options={roleOptions}
              />
              <EditableDateField
                id="contract-entry-date"
                label="Eintritt"
                name="entryDate"
                value={contract.entryDate}
              />
              <EditableDateField
                id="contract-exit-date"
                label="Austritt"
                name="exitDate"
                value={contract.exitDate}
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
        <DetailCard title="Vertragshistorie" className="[&>h2]:mb-3.5">
          <div className="flex flex-col gap-2.5">
            {contractHistory.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-border bg-bg p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-ink">
                      {item.title}
                    </div>
                    <div className="mt-1 font-mono text-[10.5px] text-muted">
                      {item.period}
                    </div>
                  </div>
                  <span className="rounded-[7px] border border-border-light bg-white px-2 py-[3px] font-mono text-[10px] text-muted-2">
                    {item.status}
                  </span>
                </div>
                <div className="mt-2 text-[12px] text-muted-2">{item.meta}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary btn-sm">
                    Ersetzen
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm">
                    Inaktiv setzen
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm text-danger">
                    Aufheben
                  </button>
                </div>
              </article>
            ))}
          </div>
        </DetailCard>
      </div>
    </div>
  );
}

function ContractTab({
  employee,
  isEditing,
  roleOptions,
  tenant,
  contracts,
}: {
  employee: Employee;
  isEditing: boolean;
  roleOptions: string[];
  tenant: string;
  contracts: EmployeeContractItem[];
}) {
  const details = employee.contractDetails;
  const activeContract = contracts.find((contract) => contract.status === "active");
  const value = (primary: string | number | undefined, fallback: string) =>
    primary === undefined || primary === "" || primary === 0 ? fallback : String(primary);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
      {isEditing && <input type="hidden" name="contractDetailsSubmitted" value="1" />}
      <div className="flex flex-col gap-4">
        <DetailCard
          title={
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-border-soft text-muted-2"><BriefcaseBusiness size={18} /></span>
                <span><span className="block">Vertragsdetails</span><span className="mt-0.5 block font-mono text-[10.5px] font-normal text-muted">Die wichtigsten Informationen auf einen Blick</span></span>
              </span>
              {activeContract && <span className="rounded-[7px] bg-success/10 px-2.5 py-1 font-mono text-[10px] text-success">Aktiv</span>}
            </div>
          }
        >
          {isEditing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <EditableTextField id="contract-type" label="Vertragsart" name="contractType" value={details.contractType} />
              <EditableSelectField id="contract-permission-role" label="Berechtigungsrolle" name="role" value={employee.role} options={roleOptions} />
              <EditableDateField id="contract-entry-date" label="Eintritt" name="entryDate" value={details.entryDate} />
              <EditableDateField id="contract-exit-date" label="Austritt" name="exitDate" value={details.exitDate} />
              <EditableTextField id="contract-position" label="Position" name="position" value={details.position} />
              <EditableTextField id="contract-department" label="Abteilung" name="department" value={details.department} />
              <EditableTextField id="contract-work-location" label="Arbeitsort" name="workLocation" value={details.workLocation} />
              <EditableTextField id="contract-working-time" label="Arbeitszeit" name="workingTime" value={details.workingTime} />
              <EditableTextField id="contract-compensation" label="Vergütung" name="compensation" value={details.compensation} />
              <EditableTextField id="contract-vacation" label="Urlaub" name="vacation" value={details.vacation} />
              <EditableTextField id="contract-probation" label="Probezeit" name="probation" value={details.probation} />
              <EditableTextField id="contract-notice-period" label="Kündigungsfrist" name="noticePeriod" value={details.noticePeriod} />
            </div>
          ) : (
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <FieldValue label="Vertragsart" value={value(activeContract?.contractType, details.contractType || employee.contract)} />
              <FieldValue label="Beginn" value={value(activeContract?.startDate, details.entryDate || employee.startDate)} mono />
              <FieldValue label="Position" value={value(activeContract?.position, details.position)} />
              <FieldValue label="Abteilung" value={value(activeContract?.department, details.department)} />
              <FieldValue label="Arbeitsort" value={value(activeContract?.workLocation, details.workLocation)} />
              <FieldValue label="Arbeitszeit" value={value(activeContract?.weeklyHours, details.workingTime || employee.weeklyHours)} />
              <FieldValue label="Vergütung" value={value(activeContract?.compensation, details.compensation)} />
              <FieldValue label="Urlaub" value={activeContract?.vacationDays ? `${activeContract.vacationDays} Tage` : details.vacation} />
              <FieldValue label="Probezeit bis" value={value(activeContract?.probationEndDate, details.probation)} mono />
              <FieldValue label="Kündigungsfrist" value={value(activeContract?.noticePeriod, details.noticePeriod)} />
            </div>
          )}
        </DetailCard>

        {!isEditing && activeContract?.notes && (
          <DetailCard title="Hinweise"><p className="whitespace-pre-wrap text-[13px] leading-6 text-muted-2">{activeContract.notes}</p></DetailCard>
        )}
      </div>

      <DetailCard title={`Alle Verträge · ${contracts.length}`} className="[&>h2]:mb-3.5">
        <EmployeeContracts
          tenant={tenant}
          employeeId={employee.dbId ?? employee.id}
          employeeHandle={employee.id}
          contracts={contracts}
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
  const { tab, edit, invited } = await searchParams;
  const [employee, roles, uploadOptions, contracts] = await Promise.all([
    getEmployeeForTenant(tenant, employeeId),
    getRolesForTenant(tenant),
    getFileUploadOptions(tenant),
    getEmployeeContracts(tenant, employeeId),
  ]);

  if (!employee || !roles) {
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
  const auditEntries = await getAuditLogsForEntity({
    tenantSlug: tenant,
    entityType: "employee",
    entityId: employee.dbId ?? employee.id,
  });
  const employeeEditHref = isContractTab
    ? `${employeeHref}?tab=contract&edit=1`
    : `${employeeHref}?edit=1`;
  const contractEditHref = `${employeeHref}?tab=contract&edit=1`;
  const showContractDetailsPrompt = isHomeTab && !hasContractDetails(employee);
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
    ? "Einladung ausstehend"
    : invitation?.status === "PENDING" && invitation.expired
      ? "Einladung abgelaufen"
      : null;
  const wasInvited = invited === "1" && Boolean(employee.email);
  const roleOptions = roles.length > 0
    ? roles.map((role) => role.name)
    : ["Mitarbeiter"];

  return (
    <>
      <UnsavedChangesGuard active={isEditing} />
      <form id="employee-edit-form" action={updateEmployeeAction}>
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="employeeId" value={employee.dbId ?? ""} />
        <input type="hidden" name="employeeHandle" value={employee.id} />
        <input
          type="hidden"
          name="activeTab"
          value={isContractTab ? "contract" : "home"}
        />
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
            {isEditing ? (
              <input
                className="input max-w-[420px] bg-white font-display text-[26px] font-semibold text-ink sm:text-[34px]"
                name="name"
                defaultValue={employee.name}
                aria-label="Name"
                required
              />
            ) : (
              employee.name
            )}
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
            {employee.hasAccount ? (
              <span className="font-mono text-[12px] text-muted">
                Account verknüpft
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
            <ConfirmSubmitButton
              className="btn btn-secondary btn-sm text-danger"
              form="employee-edit-form"
              formAction={deleteEmployeeAction}
              description={`Der Mitarbeiter "${employee.name}" wird dauerhaft geloescht.`}
            >
              Loeschen
            </ConfirmSubmitButton>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-sm">
                <MessageSquare size={14} />
                Nachricht senden
              </button>
              {!employee.hasAccount &&
                (employee.email ? (
                  <button
                    type="submit"
                    formAction={inviteEmployeeAction}
                    className="btn btn-secondary btn-sm"
                  >
                    <UserPlus size={14} />
                    {hasPendingInvitation ? "Erneut einladen" : "Einladen"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled
                    title="Zum Einladen zuerst eine E-Mail-Adresse hinterlegen"
                  >
                    <UserPlus size={14} />
                    Einladen
                  </button>
                ))}
              <Link href={employeeEditHref} className="btn btn-secondary btn-sm">
                <Pencil size={14} />
                Bearbeiten
              </Link>
            </>
          )}
        </div>
      </section>

      {wasInvited && (
        <div className="mb-4 rounded-card border border-success/25 bg-success/5 px-5 py-3.5 text-[13px] text-ink">
          Einladung an <span className="font-medium">{employee.email}</span>{" "}
          versendet. Sobald sie angenommen wurde, ist der Account mit dieser
          Personalakte verknüpft.
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
          <span className="font-mono text-[11px] text-muted">{contracts.length}</span>
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
        <FilesTab
          employee={employee}
          tenant={tenant}
          employeeHref={employeeHref}
          uploadOptions={uploadOptions}
        />
      ) : isPayrollTab ? (
        <PayrollTab employee={employee} />
      ) : isContractTab ? (
        <ContractTab
          employee={employee}
          isEditing={isEditing}
          roleOptions={roleOptions}
          tenant={tenant}
          contracts={contracts as EmployeeContractItem[]}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {showContractDetailsPrompt && (
            <ContractDetailsPrompt
              employeeName={employee.name}
              href={contractEditHref}
            />
          )}

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
                  <EditableDateField
                    id="employee-birth-date"
                    label="Geburtsdatum"
                    name="birthDate"
                    value={employee.birthDate}
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
                  <div className="sm:col-span-2">
                    <div className="mb-2 label">Anschrift</div>
                    <AddressFields
                      idPrefix="employee-private-address"
                      namePrefix="privateAddress"
                      defaults={employee.privateAddressFields}
                    />
                  </div>
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
                  <EditableDateField
                    id="employee-start-date"
                    label="Eintrittsdatum"
                    name="startDate"
                    value={employee.startDate}
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
                  <EditableSelectField
                    id="employee-role"
                    label="Berechtigungsrolle"
                    name="role"
                    value={employee.role}
                    options={roleOptions}
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
                  <FieldValue label="Berechtigungsrolle" value={employee.role} />
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

              <InfoRequestsCard
                employee={employee}
                tenant={tenant}
                employeeHandle={employee.id}
              />
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
                  <div>
                    <div className="mb-2 label">Standort-Adresse</div>
                    <AddressFields
                      idPrefix="employee-address"
                      namePrefix="address"
                      defaults={employee.addressFields}
                      className="grid gap-3"
                    />
                  </div>
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
        </div>
      )}

      <div className="mt-4">
        <AuditLogPanel entries={auditEntries} />
      </div>

      {isEditing && (
        <FloatingEditBar cancelHref={activeTabHref} formId="employee-edit-form" />
      )}
      </form>
    </>
  );
}
