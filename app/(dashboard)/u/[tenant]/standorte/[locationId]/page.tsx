import OwnerFilesTab from "@/components/OwnerFilesTab";
import AddressFields from "@/components/AddressFields";
import AddLocationEmployeesButton from "@/components/AddLocationEmployeesButton";
import AuditLogPanel from "@/components/AuditLogPanel";
import EmployeeSelector from "@/components/EmployeeSelector";
import { UnsavedChangesGuard } from "@/components/EditSafety";
import {
  LocationEditFormAndBar,
  LocationHeaderActions,
} from "@/components/LocationActionForms";
import LocationClockQrPanel from "@/components/LocationClockQrPanel";
import LocationShiftPlanner from "@/components/LocationShiftPlanner";
import { OpeningHoursEditor } from "@/components/OpeningHoursEditor";
import {
  OPENING_HOURS_WEEKDAY_LABELS,
  formatOpeningHoursRange,
} from "@/lib/opening-hours";
import { getAuditLogsForEntity } from "@/lib/audit";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { getLocationClockQr, getLocationForTenant } from "@/lib/location-service";
import { renderClockQrSvg } from "@/lib/time-clock-qr-svg";
import { locationColorPalette, locationKindLabel, locationKinds, paletteHex } from "@/lib/org-options";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import {
  getISOWeekFromDate,
  getShiftFormOptions,
  getShiftPlanForTenant,
  getShiftPlanningSettings,
} from "@/lib/shift-service";
import { getWishFreeRequestsForTenant } from "@/lib/wish-free-service";
import {
  type Location,
  type LocationActivity,
  type LocationStatus,
} from "@/lib/locations";
import { Building2, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { DbCard, avatarColor, secondaryClass } from "@/components/dashboard/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getFileUploadOptions } from "@/lib/files-server";
import { type FileUploadOptions } from "@/lib/files";
import { getTranslations } from "next-intl/server";

type T = Awaited<ReturnType<typeof getTranslations>>;

export async function generateMetadata({
  params,
}: PageProps<"/u/[tenant]/standorte/[locationId]">) {
  const { tenant, locationId } = await params;
  const location = await getLocationForTenant(tenant, locationId);

  return {
    title: location?.name ?? "Standorte",
  };
}

function LocationStatusBadge({ status, t }: { status: LocationStatus; t: T }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-[7px] bg-success/10 px-[9px] py-[3px] font-mono text-[11px] tracking-[0.3px] text-success">
        {t("active")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-[7px] bg-[#B9B9B4]/20 px-[9px] py-[3px] font-mono text-[11px] tracking-[0.3px] text-muted-2">
      {t("inactive")}
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
    <DbCard className="db-insight flex flex-col gap-2 p-[18px]">
      <span className="text-[13px] font-medium text-[#6e6e6b]">{label}</span>
      <span className={`font-display text-[30px] leading-none font-semibold tracking-[-1px] ${tone === "danger" ? "text-[#b4332a]" : ""}`}>{value}</span>
      <span className={`text-[13px] ${tone === "danger" ? "text-[#6e6e6b]" : captionColor}`}>{caption}</span>
    </DbCard>
  );
}

function DetailPanel({
  title,
  eyebrow,
  children,
  className = "",
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DbCard className={`p-[18px] ${className}`}>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 className="m-0 font-display text-[17px] font-semibold tracking-[-0.3px] text-ink">{title}</h2>
        {eyebrow}
      </div>
      {children}
    </DbCard>
  );
}

/**
 * Mindestbesetzung je Tag für diesen Standort. Leeres Feld = Unternehmensvorgabe
 * (TenantSettings.shiftMinStaffing) gilt weiter — bewusst unterschieden von
 * einer eingetragenen 0 ("hier ist keine Mindestbesetzung nötig").
 */
function MinStaffingField({
  isEditing,
  shiftMinStaffing,
  effectiveMinStaffing,
  t,
}: {
  isEditing: boolean;
  shiftMinStaffing: number | null;
  effectiveMinStaffing: number;
  t: T;
}) {
  if (!isEditing) {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-border-soft bg-bg px-3.5 py-2.5">
        <span className="text-[12.5px] text-muted-2">{t("minStaffingPerDay")}</span>
        <span className="font-mono text-[12.5px] text-ink">
          {effectiveMinStaffing}
          {shiftMinStaffing === null && (
            <span className="ml-1.5 text-[11px] text-muted">{t("companyDefault")}</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="field mb-4 max-w-[280px]">
      <label htmlFor="location-min-staffing" className="label">
        {t("minStaffingPerDay")}
      </label>
      <input
        id="location-min-staffing"
        name="shiftMinStaffing"
        type="number"
        min={0}
        max={99}
        className="input"
        defaultValue={shiftMinStaffing ?? ""}
        placeholder={t("companyDefaultPlaceholder", { count: effectiveMinStaffing })}
        form="location-edit-form"
      />
      <p className="m-0 text-[11px] text-muted">
        {t("minStaffingHint")}
      </p>
    </div>
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
  options: (string | { value: string; label: string })[];
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
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;

          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
}

const locationColorOptions = locationColorPalette;

function EditableColorField({ value, t }: { value: string; t: T }) {
  const options = locationColorOptions.some((color) => color.value === value)
    ? locationColorOptions
    : [{ value, className: value, label: t("current") }, ...locationColorOptions];

  return (
    <div className="field">
      <div className="label">{t("locationColor")}</div>
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
  max?: number,
) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 && (max === undefined || parsed <= max)
    ? parsed
    : fallback;
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

function FilesTab({
  location,
  tenant,
  locationHref,
  uploadOptions,
  canManageFiles,
  canDeleteFiles,
  activeFolder,
  t,
}: {
  location: Location;
  tenant: string;
  locationHref: string;
  uploadOptions: FileUploadOptions;
  canManageFiles: boolean;
  canDeleteFiles: boolean;
  activeFolder?: string;
  t: T;
}) {
  return (
    <OwnerFilesTab
      tenant={tenant}
      ownerType="location"
      ownerId={location.dbId ?? ""}
      basePath={locationHref}
      folders={location.fileFolders}
      files={location.files}
      uploadOptions={uploadOptions}
      canManageFiles={canManageFiles}
      canDeleteFiles={canDeleteFiles}
      initialFolderPath={activeFolder ?? ""}
      emptyLabel={t("noFilesForLocation")}
    />
  );
}

export default async function LocationDetailPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/standorte/[locationId]">) {
  const { tenant, locationId } = await params;
  const query = await searchParams;
  const { tab, edit, folder } = query;
  const activeFolder = typeof folder === "string" ? folder : undefined;
  const t = await getTranslations("LocationDetailPage");
  const tAddress = await getTranslations("AddressFields");
  const currentWeek = getISOWeekFromDate(new Date());
  const year = searchParamNumber(query.year, currentWeek.year);
  // Gültige ISO-Kalenderwochen liegen zwischen 1 und 53 (QA-Bug BUG-026).
  const week = searchParamNumber(query.week, currentWeek.week, 53);
  const [location, employees, shiftPlan, shiftOptions, uploadOptions, shiftSettings] =
    await withAccessRedirect(tenant, () =>
      Promise.all([
        getLocationForTenant(tenant, locationId),
        getEmployeesForTenant(tenant),
        getShiftPlanForTenant({ tenantSlug: tenant, year, week }),
        getShiftFormOptions(tenant),
        getFileUploadOptions(tenant),
        getShiftPlanningSettings(tenant),
      ]),
    );

  if (!location || !employees || !shiftPlan || !shiftOptions) {
    notFound();
  }

  const leadEmployeeOptions = employees.map((employee) => ({
    id: employee.dbId ?? employee.id,
    initials: employee.initials,
    name: employee.name,
    employeeNumber: employee.employeeNumber,
    location: employee.location,
    team: employee.team,
    role: employee.role,
  }));
  const currentLeadEmployeeId = location.lead.employeeId ?? undefined;

  const capabilities = await getTenantCapabilities(tenant);
  const canEditLocation = hasPermissionLevel(capabilities.locations.level, "write");
  const canDeleteLocation = capabilities.locations.canDelete;
  const canManageShifts = hasPermissionLevel(capabilities.locations.shiftsLevel ?? "none", "write");
  const canManageFiles = capabilities.locations.canUploadFiles;
  const canDeleteFiles = canManageFiles && capabilities.files.canDelete;
  const canViewAudit = capabilities.locations.canViewAudit;

  const isFilesTab = tab === "files";
  const isShiftsTab = tab === "shifts";
  const isHomeTab = !isFilesTab && !isShiftsTab;
  const isEditing = edit === "1" && isHomeTab && canEditLocation;
  const locationHref = `/u/${tenant}/standorte/${location.id}`;
  const locationEditHref = `${locationHref}?edit=1`;
  const locationDbId = location.dbId ?? "";
  const clockQr = canEditLocation && isHomeTab && !isEditing
    ? await getLocationClockQr(tenant, location.id)
    : null;
  const clockQrSvg = clockQr?.payload ? await renderClockQrSvg(clockQr.payload) : null;
  const auditEntries = canViewAudit
    ? await getAuditLogsForEntity({
        tenantSlug: tenant,
        entityType: "location",
        entityId: location.dbId ?? location.id,
      })
    : [];
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
  // Bewusst ungefiltert: die Auswahl zeigt auch die bereits zugewiesenen
  // Mitarbeiter, damit im Dialog der tatsächliche Stand des Standortteams
  // sichtbar ist (sie kommen vorausgewählt an).
  const assignableEmployees = employees.map((employee) => ({
    id: employee.dbId ?? employee.id,
    initials: employee.initials,
    name: employee.name,
    employeeNumber: employee.employeeNumber,
    location: employee.location,
    team: employee.team,
    role: employee.role,
  }));
  const assignedEmployeeIds = assignableEmployees
    .filter(
      (employee) =>
        assignedEmployeeKeys.has(employee.id) || assignedEmployeeKeys.has(employee.name),
    )
    .map((employee) => employee.id);

  const employeeByDbId = new Map(employees.map((employee) => [employee.dbId ?? employee.id, employee]));
  const todayWeekday = (["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const)[
    new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" })).getDay()
  ];
  const todayHours = location.openingHours.find((day) => day.weekday === todayWeekday);
  const accent = paletteHex(location.accentClassName, "#2c64c9");
  const tabClass = (active: boolean) =>
    `-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 pb-3 text-[14.5px] no-underline ${
      active ? "border-ink font-semibold text-ink" : "border-transparent font-medium text-[#6e6e6b] hover:text-ink"
    }`;
  const countPill = (count: number, tone = "bg-[#f2f1ed] text-[#6e6e6b]") => (
    <span className={`rounded-[6px] px-1.5 text-[12px] font-semibold ${tone}`}>{count}</span>
  );

  return (
    <>
      <UnsavedChangesGuard active={isEditing} />
      <nav aria-label={t("breadcrumb")} className="mb-[18px] flex items-center gap-2 text-[14px]">
        <Link href={`/u/${tenant}/standorte`} className={`${secondaryClass} min-h-9 bg-white px-3 py-1.5 text-[13.5px]`}>
          <ChevronLeft size={15} />
          {t("backToLocations")}
        </Link>
        <span className="text-[#9a9a96]">/</span>
        <span className="truncate font-medium">{location.name}</span>
      </nav>

      <LocationEditFormAndBar
        tenant={tenant}
        locationId={locationDbId}
        cancelHref={locationHref}
        isEditing={isEditing}
      />
      <DbCard className="db-hero relative mb-5 overflow-hidden p-0">
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
        <div className="flex flex-wrap items-start gap-5 px-7 pt-6 pb-5">
          {isEditing ? (
            <div className="flex min-w-[240px] flex-1 flex-col gap-4">
              <EditableTextField id="location-name" label={t("locationName")} name="name" value={location.name} />
              <div className="grid gap-3 sm:grid-cols-2">
                <EditableSelectField id="location-kind" label={t("type")} name="kind" value={location.kind} options={locationKinds.map((kind) => ({ value: kind, label: locationKindLabel(kind) }))} />
                <EditableSelectField
                  id="location-status"
                  label={t("status")}
                  name="status"
                  value={location.status}
                  options={[
                    { value: "active", label: t("active") },
                    { value: "inactive", label: t("inactive") },
                  ]}
                />
              </div>
              <div>
                <div className="mb-2 label">{t("address")}</div>
                <AddressFields idPrefix="location-address" defaults={location.addressFields} required formId="location-edit-form" t={tAddress} />
              </div>
              <EditableColorField value={location.accentClassName} t={t} />
            </div>
          ) : (
            <>
              <span
                className="flex size-[64px] shrink-0 items-center justify-center rounded-[16px] text-white shadow-[0_10px_28px_rgba(0,0,0,0.14)]"
                style={{ background: accent }}
              >
                <Building2 size={26} />
              </span>
              <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
                <h1 className="m-0 flex flex-wrap items-center gap-2.5 font-display text-[clamp(26px,3vw,34px)] leading-[1.1] font-semibold tracking-[-1px]">
                  {location.name}
                  <span className="rounded-[6px] bg-[#f2f1ed] px-2 py-[3px] font-sans text-[12px] font-semibold tracking-normal text-[#3d3d3a]">{locationKindLabel(location.kind)}</span>
                  <LocationStatusBadge status={location.status} t={t} />
                </h1>
                <span className="flex items-center gap-1.5 text-[14px] text-[#6e6e6b]">
                  <MapPin size={14} />
                  {location.address}
                </span>
                {todayHours && (
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#ecebe7] bg-white px-2 py-[3px] text-[12.5px]">
                      <span className={`size-1.5 rounded-full ${todayHours.mode === "closed" ? "bg-[#9a9a96]" : "bg-[#2f7a4a]"}`} />
                      {t("todayHours", { hours: formatOpeningHoursRange(todayHours) })}
                    </span>
                  </span>
                )}
              </div>
              <LocationHeaderActions
                locationName={location.name}
                locationEditHref={locationEditHref}
                canDeleteLocation={canDeleteLocation}
                canEditLocation={canEditLocation}
              />
            </>
          )}
        </div>
        {!isEditing && (
          <div className="flex gap-6 border-t border-[#f0efeb] px-7 pt-3.5">
            <Link href={locationHref} className={tabClass(isHomeTab)}>
              {t("tabHome")}
            </Link>
            <Link href={`${locationHref}?tab=files`} className={tabClass(isFilesTab)}>
              {t("tabFiles")}
              {countPill(location.files.length + location.fileFolders.length)}
            </Link>
            <Link href={`${locationHref}?tab=shifts`} className={tabClass(isShiftsTab)}>
              {t("tabShifts")}
              {(location.openShiftCount ?? 0) > 0 && countPill(location.openShiftCount ?? 0, "bg-[rgba(224,123,0,0.12)] text-[#8a5300]")}
            </Link>
          </div>
        )}
      </DbCard>

      {isFilesTab ? (
        <FilesTab
          location={location}
          tenant={tenant}
          locationHref={locationHref}
          uploadOptions={uploadOptions}
          canManageFiles={canManageFiles}
          canDeleteFiles={canDeleteFiles}
          activeFolder={activeFolder}
          t={t}
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
          breakRule={shiftSettings.breakRule}
          canManage={canManageShifts}
        />
      ) : (
        <>
          {!isEditing && (
            <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-3.5">
              <DetailMetricCard label={t("employeesMetric")} value={location.employeeCount} caption={t("activeToday", { count: location.activeToday })} />
              <DetailMetricCard label={t("shiftsActive")} value={location.shiftCount} caption={t("thisWeek")} />
              <DetailMetricCard
                label={t("openShifts")}
                value={location.openShiftCount ?? 0}
                caption={t("openShiftsCaption")}
                tone={(location.openShiftCount ?? 0) > 0 ? "danger" : "muted"}
              />
              <DetailMetricCard label={t("utilization")} value={location.utilization} caption={location.utilizationCaption} />
            </section>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              <DetailPanel title={t("leadershipAndTeam")}>
                {isEditing ? (
                  <div className="mb-5">
                    <EmployeeSelector
                      label={t("locationLead")}
                      name="lead"
                      options={leadEmployeeOptions}
                      defaultSelectedIds={currentLeadEmployeeId ? [currentLeadEmployeeId] : []}
                      form="location-edit-form"
                    />
                    <p className="mt-2 text-[11.5px] leading-[1.5] text-muted">{t("phoneEmailAutoNote")}</p>
                    <div className="field mt-4">
                      <label htmlFor="location-contact-email" className="label">
                        {t("contactEmail")}
                      </label>
                      <input
                        id="location-contact-email"
                        name="contactEmail"
                        type="email"
                        form="location-edit-form"
                        className="input"
                        defaultValue={location.contactEmail ?? ""}
                        placeholder="standort@example.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 flex items-center gap-3.5 rounded-[12px] border border-[#ecebe7] bg-[#fafaf8] px-4 py-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white" style={{ background: avatarColor(location.lead.employeeId ?? location.lead.name) }}>
                      {location.lead.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] tracking-[0.12em] text-[#6e6e6b] uppercase">{t("locationLead")}</div>
                      <div className="text-[15px] font-semibold">{location.lead.name}</div>
                    </div>
                    <div className="hidden text-right text-[13px] md:block">
                      <div>{location.lead.phone}</div>
                      <div className="text-[#6e6e6b]">{location.contactEmail || location.lead.email}</div>
                    </div>
                  </div>
                )}

                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-[#6e6e6b] uppercase">
                    {t("team")} · {location.team.length}
                  </span>
                  {canEditLocation && (
                    <AddLocationEmployeesButton tenant={tenant} locationId={locationDbId} employees={assignableEmployees} assignedIds={assignedEmployeeIds} variant="link" />
                  )}
                </div>
                <ul className="m-0 flex list-none flex-col p-0">
                  {location.team.map((member) => {
                    const employee = member.employeeId ? employeeByDbId.get(member.employeeId) : undefined;
                    const content = (
                      <>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: avatarColor(member.employeeId ?? member.name) }}>
                          {member.initials}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-1.5 text-[14px] font-semibold">
                            {member.name}
                            {member.employeeId && member.employeeId === location.lead.employeeId && (
                              <span className="rounded-[5px] bg-[rgba(139,111,224,0.12)] px-1.5 text-[11px] font-semibold text-[#6b4fc4]">{t("leadBadge")}</span>
                            )}
                          </span>
                          {employee && <span className="truncate text-[12.5px] text-[#6e6e6b]">{[employee.role, ...(employee.teams?.length ? employee.teams : [employee.team])].filter(Boolean).join(" · ")}</span>}
                        </span>
                        {employee && <ChevronRight size={16} className="text-[#9a9a96]" />}
                      </>
                    );

                    return (
                      <li key={`${member.initials}-${member.name}`} className="border-b border-[#f0efeb] last:border-b-0">
                        {employee ? (
                          <Link href={`/u/${tenant}/employees/${employee.id}`} className="flex items-center gap-3 rounded-[8px] px-1 py-2.5 text-ink no-underline hover:bg-[#fafaf8]">
                            {content}
                          </Link>
                        ) : (
                          <span className="flex items-center gap-3 px-1 py-2.5">{content}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </DetailPanel>

              <DetailPanel
                title={t("openingHoursAndStaffing")}
                eyebrow={
                  location.usesDefaultOpeningHours && !isEditing ? (
                    <span className="rounded-[6px] bg-[rgba(139,111,224,0.10)] px-2 py-[3px] text-[12px] font-semibold text-[#6b4fc4]">{t("companyDefaultBadge")}</span>
                  ) : undefined
                }
              >
                {isEditing ? (
                  <>
                    <MinStaffingField isEditing shiftMinStaffing={location.shiftMinStaffing} effectiveMinStaffing={location.effectiveMinStaffing} t={t} />
                    <OpeningHoursEditor
                      name="openingHours"
                      defaultValue={location.openingHours}
                      allowInherit
                      initiallyCustom={!location.usesDefaultOpeningHours}
                      formId="location-edit-form"
                    />
                  </>
                ) : (
                  <>
                    <div className="flex flex-col">
                      {location.openingHours.map((day) => (
                        <div
                          key={day.weekday}
                          className={`flex items-center justify-between rounded-[8px] px-2.5 py-1.5 text-[14px] ${day.weekday === todayWeekday ? "bg-[rgba(139,111,224,0.08)] font-semibold" : ""}`}
                        >
                          <span className="flex items-center gap-2">
                            {OPENING_HOURS_WEEKDAY_LABELS[day.weekday]}
                            {day.weekday === todayWeekday && (
                              <span className="rounded-[5px] bg-[rgba(139,111,224,0.14)] px-1.5 text-[11px] font-semibold text-[#6b4fc4]">{t("today")}</span>
                            )}
                          </span>
                          <span className="tabular-nums">{formatOpeningHoursRange(day)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-[12px] border border-[#ecebe7] px-4 py-3">
                      <span className="flex flex-col">
                        <span className="font-mono text-[10px] tracking-[0.12em] text-[#6e6e6b] uppercase">{t("minStaffingShort")}</span>
                        <span className="text-[15px] font-semibold">{t("personsPerDay", { count: location.effectiveMinStaffing })}</span>
                      </span>
                      <span className="rounded-[7px] border border-[#ecebe7] px-2 py-[3px] text-[12px]">
                        {location.shiftMinStaffing === null ? t("companyDefault") : t("ownValue")}
                      </span>
                    </div>
                  </>
                )}
              </DetailPanel>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              {clockQr && (
                <DetailPanel
                  title={t("clockQrTitle")}
                  eyebrow={
                    clockQr.qrRequired ? (
                      <span className="rounded-[6px] bg-[rgba(47,122,74,0.12)] px-2 py-[3px] text-[12px] font-semibold text-[#1f5d2c]">{t("scanRequired")}</span>
                    ) : undefined
                  }
                >
                  <LocationClockQrPanel
                    tenant={tenant}
                    locationId={clockQr.locationId}
                    printHref={`${locationHref}/stempel-qr`}
                    svg={clockQrSvg}
                    qrRequired={clockQr.qrRequired}
                  />
                </DetailPanel>
              )}

              {!isEditing && (
                <DetailPanel
                  title={t("activity")}
                  eyebrow={
                    <span className="inline-flex items-center gap-1 rounded-[7px] bg-[rgba(180,51,42,0.08)] px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[0.5px] text-[#b4332a]">
                      <span className="size-1.5 rounded-full bg-[#b4332a]" />
                      {t("live")}
                    </span>
                  }
                >
                  {location.activity.length === 0 && <p className="m-0 text-[13px] text-[#6e6e6b]">{t("noActivity")}</p>}
                  {location.activity.map((item, index) => (
                    <ActivityItem key={`${item.actor}-${item.time}`} item={item} isLast={index === location.activity.length - 1} />
                  ))}
                </DetailPanel>
              )}
            </div>
          </div>
        </>
      )}
      {canViewAudit && (
        <div className="mt-4">
          <AuditLogPanel entries={auditEntries} />
        </div>
      )}
    </>
  );
}
