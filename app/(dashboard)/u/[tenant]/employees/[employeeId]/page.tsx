import { DataTableStatus } from "@/components/DataTable";
import {
  employeeStatusConfig,
  getEmployeeById,
  type Employee,
  type EmployeeFile,
  type EmployeeFileFolder,
  type EmployeeTimelineItem,
} from "@/lib/employees";
import {
  ArrowLeft,
  FileText,
  Folder,
  FolderPlus,
  Lock,
  MessageSquare,
  Pencil,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

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
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-[13px] rounded-xl border border-border bg-white p-[15px] text-left font-sans transition-colors hover:bg-bg"
    >
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
    </button>
  );
}

function FileRow({ file }: { file: EmployeeFile }) {
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-3.5 border-t border-border-soft py-3 text-left font-sans transition-colors hover:bg-bg"
    >
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
    </button>
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
  const { tab } = await searchParams;
  const employee = getEmployeeById(employeeId);

  if (!employee) {
    notFound();
  }

  const status = employeeStatusConfig[employee.status];
  const isFilesTab = tab === "files";
  const vacationPercent = Math.round(
    (employee.vacationTaken / employee.vacationTotal) * 100,
  );

  return (
    <>
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
          <button type="button" className="btn btn-primary btn-sm">
            <MessageSquare size={14} />
            Nachricht senden
          </button>
          <button type="button" className="btn btn-secondary btn-sm">
            <Pencil size={14} />
            Bearbeiten
          </button>
        </div>
      </section>

      <div className="mb-5 flex gap-[26px] border-b border-border">
        <Link
          href={`/u/${tenant}/employees/${employee.id}`}
          className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
            !isFilesTab
              ? "border-ink font-semibold text-ink"
              : "border-transparent font-medium text-muted"
          }`}
        >
          Home
        </Link>
        <Link
          href={`/u/${tenant}/employees/${employee.id}?tab=files`}
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
      </div>

      {isFilesTab ? (
        <FilesTab employee={employee} />
      ) : (
        <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          <div className="flex flex-col gap-4">
            <DetailCard title={"Besch\u00e4ftigung"}>
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
            </DetailCard>

            <DetailCard title="Abwesenheit & Urlaub">
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
          </div>

          <div className="flex flex-col gap-4">
            <DetailCard title="Kontakt">
              <div className="flex flex-col gap-4">
                <FieldValue label="E-Mail" value={employee.email} mono />
                <FieldValue label="Telefon" value={employee.phone} mono />
                <FieldValue label="Standort-Adresse" value={employee.address} />
              </div>
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

      <div className="mt-8 text-center font-mono text-[10px] tracking-[0.4px] text-[#B0B0AB]">
        Ployo {"\u00b7"} Personalakte-System {"\u00b7"} Alle Zugriffe
        protokolliert {"\u00b7"} Server in Frankfurt
      </div>
    </>
  );
}
