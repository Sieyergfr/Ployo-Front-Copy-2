import { FileReminderButton } from "@/components/ActionDrawers";
import AddressFields from "@/components/AddressFields";
import AddLocationEmployeesButton from "@/components/AddLocationEmployeesButton";
import AuditLogPanel from "@/components/AuditLogPanel";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import {
  CreateFolderButton,
  UploadFileButton,
} from "@/components/FileActionButtons";
import { UnsavedChangesGuard } from "@/components/EditSafety";
import FloatingEditBar from "@/components/FloatingEditBar";
import LocationShiftPlanner from "@/components/LocationShiftPlanner";
import {
  deleteLocationAction,
  updateLocationAction,
} from "@/app/(dashboard)/u/[tenant]/standorte/actions";
import { getAuditLogsForEntity } from "@/lib/audit";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { getLocationForTenant } from "@/lib/location-service";
import {
  getISOWeekFromDate,
  getShiftFormOptions,
  getShiftPlanForTenant,
} from "@/lib/shift-service";
import { getWishFreeRequestsForTenant } from "@/lib/wish-free-service";
import {
  type Location,
  type LocationActivity,
  type LocationFile,
  type LocationFileFolder,
  type LocationShiftCell,
  type LocationShiftEmployee,
  type LocationShiftRow,
  type LocationShiftTone,
  type LocationStatus,
} from "@/lib/locations";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  Lock,
  Pencil,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getFileUploadOptions, type FileFolder, type FileUploadOptions } from "@/lib/files";

export async function generateMetadata({
  params,
}: PageProps<"/u/[tenant]/standorte/[locationId]">) {
  const { tenant, locationId } = await params;
  const location = await getLocationForTenant(tenant, locationId);

  return {
    title: location?.name ?? "Standorte",
  };
}

function LocationStatusBadge({ status }: { status: LocationStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-[7px] bg-success/10 px-[9px] py-[3px] font-mono text-[11px] tracking-[0.3px] text-success">
        Aktiv
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-[7px] bg-[#B9B9B4]/20 px-[9px] py-[3px] font-mono text-[11px] tracking-[0.3px] text-muted-2">
      Inaktiv
    </span>
  );
}

function DetailMetricCard({
  label,
  value,
  caption,
  tone = "muted",
}: {
  label: string;
  value: ReactNode;
  caption: ReactNode;
  tone?: "muted" | "success" | "danger";
}) {
  const captionColor = {
    danger: "text-danger",
    muted: "text-muted",
    success: "text-success",
  }[tone];

  return (
    <div className="rounded-[14px] border border-border bg-white px-5 pt-5 pb-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-muted">
        {label}
      </div>
      <div className="my-[14px] mb-[9px] font-display text-[38px] font-semibold leading-none tracking-[-1.2px] text-ink">
        {value}
      </div>
      <div className={`text-[12px] ${captionColor}`}>{caption}</div>
    </div>
  );
}

function DetailPanel({
  title,
  eyebrow,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-white px-6 py-[22px]">
      <div className="mb-[18px] flex items-center justify-between gap-3">
        <h2 className="font-display text-[17px] font-semibold tracking-[-0.3px] text-ink">
          {title}
        </h2>
        {eyebrow}
      </div>
      {children}
    </section>
  );
}

function EditableTextField({
  id,
  label,
  name,
  value,
  type = "text",
}: {
  id: string;
  label: string;
  name: string;
  value: string | number;
  type?: "text" | "email" | "tel" | "number";
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        form="location-edit-form"
        type={type}
        className="input bg-white"
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
        form="location-edit-form"
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

const locationColorOptions = [
  { value: "bg-ink", className: "bg-ink", label: "Schwarz" },
  { value: "bg-[#2A6FDB]", className: "bg-[#2A6FDB]", label: "Blau" },
  { value: "bg-success", className: "bg-success", label: "Gruen" },
  { value: "bg-[#8B6ED4]", className: "bg-[#8B6ED4]", label: "Violett" },
  { value: "bg-[#C9622A]", className: "bg-[#C9622A]", label: "Orange" },
  { value: "bg-danger", className: "bg-danger", label: "Rot" },
  { value: "bg-[#168A8A]", className: "bg-[#168A8A]", label: "Tuerkis" },
  { value: "bg-[#5C6B7A]", className: "bg-[#5C6B7A]", label: "Schiefer" },
];

function EditableColorField({ value }: { value: string }) {
  const options = locationColorOptions.some((color) => color.value === value)
    ? locationColorOptions
    : [{ value, className: value, label: "Aktuell" }, ...locationColorOptions];

  return (
    <div className="field">
      <div className="label">Standortfarbe</div>
      <div className="flex flex-wrap gap-2">
        {options.map((color) => (
          <label
            key={color.value}
            className="group flex size-9 cursor-pointer items-center justify-center rounded-[9px] border border-border transition-colors hover:border-muted has-[:checked]:border-ink"
            title={color.label}
          >
            <input
              type="radio"
              name="color"
              value={color.value}
              form="location-edit-form"
              defaultChecked={value === color.value}
              className="peer sr-only"
            />
            <span
              className={`size-4 rounded-full transition-transform peer-checked:scale-110 ${color.className}`}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function searchParamNumber(
  value: string | string[] | undefined,
  fallback: number,
) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function TeamChip({ member }: { member: Location["team"][number] }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-2">
      <span className="flex size-6 items-center justify-center rounded-full bg-white font-mono text-[9px] font-semibold text-muted-2">
        {member.initials}
      </span>
      <span className="text-[12.5px] font-medium text-ink">{member.name}</span>
    </span>
  );
}

function ActivityDot({ tone }: { tone: LocationActivity["tone"] }) {
  const color = {
    blue: "bg-[#2A6FDB]",
    danger: "bg-danger",
    ink: "bg-ink",
    success: "bg-success",
  }[tone];

  return <span className={`size-2 rounded-full ${color}`} />;
}

function ActivityItem({
  item,
  isLast,
}: {
  item: LocationActivity;
  isLast: boolean;
}) {
  return (
    <div className="flex gap-[13px] pb-3.5">
      <div className="flex shrink-0 flex-col items-center pt-[5px]">
        <ActivityDot tone={item.tone} />
        {!isLast && <span className="mt-[6px] w-px flex-1 bg-border" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-[1.45] text-ink">
          <span className="font-semibold">{item.actor}</span> {item.text}
        </div>
        <div className="mt-[3px] font-mono text-[10.5px] text-muted">
          {item.time}
        </div>
      </div>
    </div>
  );
}

function FileFolderCard({
  folder,
  tenant,
  returnPath,
}: {
  folder: LocationFileFolder;
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
        context={`Standortordner \u00b7 ${folder.name}`}
      />
    </div>
  );
}

function FileRow({
  file,
  tenant,
  returnPath,
}: {
  file: LocationFile;
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
        context={`${file.folder} \u00b7 Standortdatei`}
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

function locationFolderOptions(location: Location): FileFolder[] {
  return location.fileFolders.map((folder) => ({
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
  location,
  tenant,
  locationHref,
  uploadOptions,
}: {
  location: Location;
  tenant: string;
  locationHref: string;
  uploadOptions: FileUploadOptions;
}) {
  const folderOptions = locationFolderOptions(location);

  return (
    <DetailPanel
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
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[10.5px] text-muted">
          {location.fileFolders.length} Ordner {"\u00b7"} {location.files.length}{" "}
          Dateien
        </span>
        <div className="flex flex-wrap gap-2">
          <CreateFolderButton
            tenant={tenant}
            returnPath={`${locationHref}?tab=files`}
            ownerType="location"
            ownerId={location.dbId}
          />
          <UploadFileButton
            tenant={tenant}
            returnPath={`${locationHref}?tab=files`}
            ownerType="location"
            ownerId={location.dbId}
            folderOptions={folderOptions}
            uploadOptions={uploadOptions}
          />
        </div>
      </div>

      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        {location.fileFolders.map((folder) => (
            <FileFolderCard
              key={folder.name}
              folder={folder}
              tenant={tenant}
              returnPath={`${locationHref}?tab=files`}
            />
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
          Dateien
        </div>
        {location.files.map((file) => (
            <FileRow
              key={`${file.folder}-${file.name}`}
              file={file}
              tenant={tenant}
              returnPath={`${locationHref}?tab=files`}
            />
        ))}
      </div>
    </DetailPanel>
  );
}

function ShiftToneMark({ tone }: { tone: LocationShiftTone }) {
  const color = {
    blue: "bg-[#2A6FDB]",
    muted: "bg-muted-2",
    success: "bg-success",
  }[tone];

  return <span className={`size-[9px] shrink-0 rounded-[2px] ${color}`} />;
}

function ShiftCell({ cell }: { cell: LocationShiftCell }) {
  if (cell.state === "empty") {
    return (
      <div className="flex min-h-[54px] items-center justify-center rounded-[9px] bg-border-soft" />
    );
  }

  const isWarning = cell.state === "warning";

  return (
    <button
      type="button"
      className={`flex min-h-[54px] cursor-pointer flex-col items-center justify-center rounded-[9px] px-1 py-2 font-mono transition-colors ${
        isWarning
          ? "border border-danger/35 bg-danger/15 text-danger hover:bg-danger/20"
          : "bg-ink text-white hover:bg-muted-2"
      }`}
    >
      <span className="text-[11px] font-semibold">{cell.staffing}</span>
      <span
        className={`mt-0.5 text-[9px] ${
          isWarning ? "text-danger/80" : "text-white/60"
        }`}
      >
        {cell.time}
      </span>
    </button>
  );
}

function ShiftRow({ row }: { row: LocationShiftRow }) {
  return (
    <div className="mb-[7px] grid items-center gap-1.5 [grid-template-columns:130px_repeat(7,1fr)]">
      <div className="flex items-center gap-[7px] px-1 py-0.5">
        <ShiftToneMark tone={row.tone} />
        <span className="text-[12.5px] font-semibold text-ink">{row.label}</span>
      </div>
      {row.cells.map((cell, index) => (
        <ShiftCell key={`${row.label}-${index}`} cell={cell} />
      ))}
    </div>
  );
}

function EmployeeShiftMark({
  value,
}: {
  value: LocationShiftEmployee["days"][number];
}) {
  if (!value) {
    return (
      <div className="flex h-[26px] items-center justify-center rounded-md bg-border-soft" />
    );
  }

  return (
    <button
      type="button"
      className="flex h-[30px] w-full cursor-pointer items-center justify-center rounded-md bg-ink px-1 font-mono text-[10px] font-semibold text-white transition-colors hover:bg-muted-2"
      title="Schicht bearbeiten"
    >
      {value}
    </button>
  );
}

function EmployeeShiftRow({ employee }: { employee: LocationShiftEmployee }) {
  return (
    <div className="grid items-center gap-1.5 border-t border-border-soft py-[7px] [grid-template-columns:180px_repeat(7,1fr)]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-ink text-[9.5px] font-semibold text-white">
          {employee.initials}
        </span>
        <span className="truncate text-[12.5px] font-semibold text-ink">
          {employee.name}
        </span>
      </div>
      {employee.days.map((day, index) => (
        <EmployeeShiftMark key={`${employee.initials}-${index}`} value={day} />
      ))}
    </div>
  );
}

function ShiftsTab({ location }: { location: Location }) {
  const { shiftPlan } = location;

  return (
    <section className="overflow-hidden rounded-card border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[22px] pt-5 pb-4">
        <div>
          <h2 className="m-0 font-display text-[17px] font-semibold tracking-[-0.3px] text-ink">
            Schichtplan {"\u00b7"} {shiftPlan.week}
          </h2>
          <div className="mt-1 text-[12.5px] text-muted">{location.name}</div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm">
          <Plus size={14} />
          Schicht planen
        </button>
      </div>

      <div className="overflow-x-auto px-[22px] pt-4 pb-[22px]">
        <div className="min-w-[680px]">
          <div className="mb-2 grid gap-1.5 [grid-template-columns:130px_repeat(7,1fr)]">
            <div />
            {shiftPlan.days.map((day) => (
              <div
                key={day.label}
                className={`text-center font-mono text-[11px] font-medium ${
                  day.weekend ? "text-danger" : "text-ink"
                }`}
              >
                <div>{day.label}</div>
                <div className="mt-0.5 text-[9px] text-[#B0B0AB]">
                  {day.date}
                </div>
              </div>
            ))}
          </div>

          {shiftPlan.rows.map((row) => (
            <ShiftRow key={row.label} row={row} />
          ))}
        </div>
      </div>

      <div className="border-t border-border px-[22px] py-[18px]">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.5px] text-muted">
            Eingeplante Mitarbeiter
          </div>
          <div className="flex items-center gap-1 rounded-[10px] border border-border bg-bg p-1">
            <button type="button" className="flex size-7 items-center justify-center rounded-[8px] bg-white text-muted">
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 font-mono text-[11px] font-semibold text-ink">
              {shiftPlan.week}
            </span>
            <button type="button" className="flex size-7 items-center justify-center rounded-[8px] bg-white text-muted">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid items-center gap-1.5 pb-2 [grid-template-columns:180px_repeat(7,1fr)]">
              <div />
              {shiftPlan.days.map((day) => (
                <div
                  key={`employee-head-${day.label}`}
                  className={`text-center font-mono text-[10px] font-semibold ${
                    day.weekend ? "text-danger" : "text-muted"
                  }`}
                >
                  {day.label}
                </div>
              ))}
            </div>
            {shiftPlan.employees.map((employee) => (
              <EmployeeShiftRow key={employee.initials} employee={employee} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

void ShiftsTab;

export default async function LocationDetailPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/standorte/[locationId]">) {
  const { tenant, locationId } = await params;
  const query = await searchParams;
  const { tab, edit } = query;
  const currentWeek = getISOWeekFromDate(new Date());
  const year = searchParamNumber(query.year, currentWeek.year);
  const week = searchParamNumber(query.week, currentWeek.week);
  const [location, employees, shiftPlan, shiftOptions, uploadOptions] = await Promise.all([
    getLocationForTenant(tenant, locationId),
    getEmployeesForTenant(tenant),
    getShiftPlanForTenant({ tenantSlug: tenant, year, week }),
    getShiftFormOptions(tenant),
    getFileUploadOptions(tenant),
  ]);

  if (!location || !employees || !shiftPlan || !shiftOptions) {
    notFound();
  }

  const isFilesTab = tab === "files";
  const isShiftsTab = tab === "shifts";
  const isHomeTab = !isFilesTab && !isShiftsTab;
  const isEditing = edit === "1" && isHomeTab;
  const locationHref = `/u/${tenant}/standorte/${location.id}`;
  const locationEditHref = `${locationHref}?edit=1`;
  const locationDbId = location.dbId ?? "";
  const auditEntries = await getAuditLogsForEntity({
    tenantSlug: tenant,
    entityType: "location",
    entityId: location.dbId ?? location.id,
  });
  const assignedEmployeeKeys = new Set(
    location.team.map((member) => member.employeeId ?? member.name),
  );
  const locationShiftEmployeeKeys = new Set(
    location.team.flatMap((member) => [member.employeeId, member.name].filter(Boolean)),
  );
  const locationShiftEmployees = shiftOptions.employees.filter(
    (employee) =>
      employee.location === location.name ||
      locationShiftEmployeeKeys.has(employee.id) ||
      locationShiftEmployeeKeys.has(employee.name),
  );
  const locationShiftEmployeeIds = new Set(
    locationShiftEmployees.map((employee) => employee.id),
  );
  const wishFreeRequests = (
    await getWishFreeRequestsForTenant({ tenantSlug: tenant })
  ).filter((request) => locationShiftEmployeeIds.has(request.employeeId));
  const assignableEmployees = employees
    .filter(
      (employee) =>
        !assignedEmployeeKeys.has(employee.dbId ?? employee.id) &&
        !assignedEmployeeKeys.has(employee.name),
    )
    .map((employee) => ({
      id: employee.dbId ?? employee.id,
      initials: employee.initials,
      name: employee.name,
      employeeNumber: employee.employeeNumber,
      location: employee.location,
      team: employee.team,
      role: employee.role,
    }));

  return (
    <>
      <UnsavedChangesGuard active={isEditing} />
      <div className="mb-[18px]">
        <Link
          href={`/u/${tenant}/standorte`}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.5px] text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={13} />
          Alle Standorte
        </Link>
      </div>

      <form
        id="location-edit-form"
        action={updateLocationAction}
        className="hidden"
        aria-hidden="true"
      >
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="locationId" value={locationDbId} />
      </form>
      <section className="mb-5 overflow-hidden rounded-card border border-border bg-white">
        <div className={`h-1 w-full ${location.accentClassName}`} />
        <div className="flex flex-wrap items-start gap-6 px-7 py-7">
          <div className="min-w-[240px] flex-1">
            {isEditing ? (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                <EditableTextField
                  id="location-name"
                  label="Standortname"
                  name="name"
                  value={location.name}
                />
                <EditableSelectField
                  id="location-kind"
                  label="Typ"
                  name="kind"
                  value={location.kind}
                  options={["Filiale", "Lager", "Verwaltung"]}
                />
                <div className="sm:col-span-2">
                  <div className="mb-2 label">Adresse</div>
                  <AddressFields
                    idPrefix="location-address"
                    defaults={location.addressFields}
                    required
                  />
                </div>
                <EditableSelectField
                  id="location-status"
                  label="Status"
                  name="status"
                  value={location.status}
                  options={["active", "inactive"]}
                />
                <EditableColorField value={location.accentClassName} />
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted">
                    {location.kind}
                  </span>
                  <LocationStatusBadge status={location.status} />
                </div>
                <h1 className="m-0 font-display text-[clamp(30px,3.6vw,44px)] font-semibold leading-[1.02] tracking-[-1.2px] text-ink">
                  {location.name}
                </h1>
                <div className="mt-[9px] text-[13.5px] text-muted-2">
                  {location.address}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5">
            {!isEditing && (
              <>
                <ConfirmSubmitButton
                  form="location-edit-form"
                  formAction={deleteLocationAction}
                  className="btn btn-secondary btn-sm border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
                  description={`Der Standort "${location.name}" wird dauerhaft geloescht.`}
                >
                  Loeschen
                </ConfirmSubmitButton>
                <Link href={locationEditHref} className="btn btn-secondary btn-sm">
                  <Pencil size={14} />
                  Bearbeiten
                </Link>
                <AddLocationEmployeesButton
                  tenant={tenant}
                  locationId={locationDbId}
                  employees={assignableEmployees}
                />
              </>
            )}
          </div>
        </div>
      </section>

      <div className="mb-5 flex gap-[26px] border-b border-border">
        <Link
          href={locationHref}
          className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
            isHomeTab
              ? "border-ink font-semibold text-ink"
              : "border-transparent font-medium text-muted"
          }`}
        >
          Home
        </Link>
        <Link
          href={`${locationHref}?tab=files`}
          className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
            isFilesTab
              ? "border-ink font-semibold text-ink"
              : "border-transparent font-medium text-muted"
          }`}
        >
          Dateien
          <span className="font-mono text-[11px] text-muted">
            {location.files.length + location.fileFolders.length}
          </span>
        </Link>
        <Link
          href={`${locationHref}?tab=shifts`}
          className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
            isShiftsTab
              ? "border-ink font-semibold text-ink"
              : "border-transparent font-medium text-muted"
          }`}
        >
          Schichten
        </Link>
      </div>

      {isFilesTab ? (
        <FilesTab
          location={location}
          tenant={tenant}
          locationHref={locationHref}
          uploadOptions={uploadOptions}
        />
      ) : isShiftsTab ? (
        <LocationShiftPlanner
          tenant={tenant}
          location={location}
          year={year}
          week={week}
          weekLabel={shiftPlan.label}
          weekRange={shiftPlan.range}
          days={shiftPlan.days.map((day) => ({
            ...day,
            shifts: day.shifts.filter((shift) => shift.locationId === locationDbId),
          }))}
          employees={locationShiftEmployees}
          wishFreeRequests={wishFreeRequests}
        />
      ) : (
        <>
          {!isEditing && (
          <section className="mb-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
              <>
                <DetailMetricCard
                  label="Mitarbeiter"
                  value={location.employeeCount}
                  caption={`${location.activeToday} aktiv heute`}
                />
                <DetailMetricCard
                  label="Schichten aktiv"
                  value={location.shiftCount}
                  caption="diese Woche"
                />
                <DetailMetricCard
                  label="Offene Stellen"
                  value={location.openPositions}
                  caption={"Frühschicht Do."}
                  tone="danger"
                />
                <DetailMetricCard
                  label="Auslastung"
                  value={location.utilization}
                  caption={location.utilizationCaption}
                  tone="success"
                />
              </>
          </section>
          )}

          <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            <DetailPanel title="Leitung & Team">
              {isEditing ? (
                <div className="mb-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                  <EditableTextField
                    id="location-lead-name"
                    label="Leitung"
                    name="leadName"
                    value={location.lead.name}
                  />
                  <EditableTextField
                    id="location-lead-initials"
                    label="Initialen"
                    name="leadInitials"
                    value={location.lead.initials}
                  />
                  <EditableTextField
                    id="location-lead-phone"
                    label="Telefon"
                    name="leadPhone"
                    type="tel"
                    value={location.lead.phone}
                  />
                  <EditableTextField
                    id="location-lead-email"
                    label="E-Mail"
                    name="leadEmail"
                    type="email"
                    value={location.lead.email}
                  />
                </div>
              ) : (
                <div className="mb-5 flex items-center gap-3.5 rounded-[12px] border border-border-soft bg-bg px-4 py-3.5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">
                    {location.lead.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-ink">
                      {location.lead.name}
                    </div>
                    <div className="mt-[3px] font-mono text-[10.5px] text-muted">
                      Standortleitung
                    </div>
                  </div>
                  <div className="hidden text-right md:block">
                    <div className="font-mono text-[10.5px] text-muted-2">
                      {location.lead.phone}
                    </div>
                    <div className="mt-[3px] font-mono text-[10.5px] text-muted">
                      {location.lead.email}
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
                Team
              </div>
              <div className="flex flex-wrap gap-2">
                {location.team.map((member) => (
                  <TeamChip
                    key={`${member.initials}-${member.name}`}
                    member={member}
                  />
                ))}
              </div>
            </DetailPanel>

            <DetailPanel
              title={"Aktivit\u00e4t"}
              eyebrow={
                <span className="rounded-[7px] bg-success/10 px-2 py-[3px] font-mono text-[9.5px] font-semibold tracking-[0.5px] text-success">
                  LIVE
                </span>
              }
            >
              {location.activity.map((item, index) => (
                <ActivityItem
                  key={`${item.actor}-${item.time}`}
                  item={item}
                  isLast={index === location.activity.length - 1}
                />
              ))}
            </DetailPanel>
          </div>
        </>
      )}
      <div className="mt-4">
        <AuditLogPanel entries={auditEntries} />
      </div>

      {isEditing && (
        <FloatingEditBar cancelHref={locationHref} formId="location-edit-form" />
      )}
    </>
  );
}
