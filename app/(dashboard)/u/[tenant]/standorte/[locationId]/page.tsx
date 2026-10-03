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
import LocationShiftPlanner from "@/components/LocationShiftPlanner";
import { OpeningHoursEditor } from "@/components/OpeningHoursEditor";
import {
  OPENING_HOURS_WEEKDAY_LABELS,
  formatOpeningHoursRange,
} from "@/lib/opening-hours";
import { getAuditLogsForEntity } from "@/lib/audit";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { getLocationForTenant } from "@/lib/location-service";
import { locationColorPalette, locationKinds } from "@/lib/org-options";
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
import { ArrowLeft } from "lucide-react";
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
  className = "",
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card border border-border bg-white px-6 py-[22px] ${className}`}>
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

function FilesTab({
  location,
  tenant,
  locationHref,
  uploadOptions,
  canManageFiles,
  activeFolder,
  t,
}: {
  location: Location;
  tenant: string;
  locationHref: string;
  uploadOptions: FileUploadOptions;
  canManageFiles: boolean;
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
  const canViewAudit = capabilities.locations.canViewAudit;

  const isFilesTab = tab === "files";
  const isShiftsTab = tab === "shifts";
  const isHomeTab = !isFilesTab && !isShiftsTab;
  const isEditing = edit === "1" && isHomeTab && canEditLocation;
  const locationHref = `/u/${tenant}/standorte/${location.id}`;
  const locationEditHref = `${locationHref}?edit=1`;
  const locationDbId = location.dbId ?? "";
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

  return (
    <>
      <UnsavedChangesGuard active={isEditing} />
      <div className="mb-[18px]">
        <Link
          href={`/u/${tenant}/standorte`}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.5px] text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={13} />
          {t("backToLocations")}
        </Link>
      </div>

      <LocationEditFormAndBar
        tenant={tenant}
        locationId={locationDbId}
        cancelHref={locationHref}
        isEditing={isEditing}
      />
      <section className="mb-5 overflow-hidden rounded-card border border-border bg-white">
        <div className={`h-1 w-full ${location.accentClassName}`} />
        <div className="flex flex-wrap items-start gap-6 px-7 py-7">
          <div className="min-w-[240px] flex-1">
            {isEditing ? (
              <div className="flex flex-col gap-4">
                <EditableTextField
                  id="location-name"
                  label={t("locationName")}
                  name="name"
                  value={location.name}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditableSelectField
                    id="location-kind"
                    label={t("type")}
                    name="kind"
                    value={location.kind}
                    options={[...locationKinds]}
                  />
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
                  <AddressFields
                    idPrefix="location-address"
                    defaults={location.addressFields}
                    required
                    formId="location-edit-form"
                    t={tAddress}
                  />
                </div>
                <EditableColorField value={location.accentClassName} t={t} />
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted">
                    {location.kind}
                  </span>
                  <LocationStatusBadge status={location.status} t={t} />
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

          {!isEditing && (
            <LocationHeaderActions
              locationName={location.name}
              locationEditHref={locationEditHref}
              canDeleteLocation={canDeleteLocation}
              canEditLocation={canEditLocation}
            />
          )}
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
          {t("tabHome")}
        </Link>
        <Link
          href={`${locationHref}?tab=files`}
          className={`mb-[-1px] inline-flex items-center gap-2 border-b-2 px-0.5 py-3 text-[14px] ${
            isFilesTab
              ? "border-ink font-semibold text-ink"
              : "border-transparent font-medium text-muted"
          }`}
        >
          {t("tabFiles")}
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
          {t("tabShifts")}
        </Link>
      </div>

      {isFilesTab ? (
        <FilesTab
          location={location}
          tenant={tenant}
          locationHref={locationHref}
          uploadOptions={uploadOptions}
          canManageFiles={canManageFiles}
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
          <section className="mb-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
              <>
                <DetailMetricCard
                  label={t("employeesMetric")}
                  value={location.employeeCount}
                  caption={t("activeToday", { count: location.activeToday })}
                />
                <DetailMetricCard
                  label={t("shiftsActive")}
                  value={location.shiftCount}
                  caption={t("thisWeek")}
                />
                <DetailMetricCard
                  label={t("openPositions")}
                  value={location.openPositions}
                  caption={t("thisWeek")}
                  tone={location.openPositions > 0 ? "danger" : "muted"}
                />
                <DetailMetricCard
                  label={t("utilization")}
                  value={location.utilization}
                  caption={location.utilizationCaption}
                  tone="success"
                />
              </>
          </section>
          )}

          <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
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
                  <p className="mt-2 text-[11.5px] leading-[1.5] text-muted">
                    {t("phoneEmailAutoNote")}
                  </p>
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
                      {t("locationLead")}
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

              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
                  {t("team")}
                </span>
                {canEditLocation && (
                  <AddLocationEmployeesButton
                    tenant={tenant}
                    locationId={locationDbId}
                    employees={assignableEmployees}
                    assignedIds={assignedEmployeeIds}
                    variant="icon"
                  />
                )}
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

            {/* Eigene Zeile über die volle Breite: die Wochentage stehen darin
                nebeneinander und brauchen mehr Platz als eine Spalte hergibt. */}
            <DetailPanel title={t("openingHoursAndStaffing")} className="[grid-column:1/-1]">
              <MinStaffingField
                isEditing={isEditing}
                shiftMinStaffing={location.shiftMinStaffing}
                effectiveMinStaffing={location.effectiveMinStaffing}
                t={t}
              />
              {isEditing ? (
                <OpeningHoursEditor
                  name="openingHours"
                  defaultValue={location.openingHours}
                  allowInherit
                  initiallyCustom={!location.usesDefaultOpeningHours}
                  formId="location-edit-form"
                />
              ) : (
                <div className="grid gap-1.5">
                  {location.openingHours.map((day) => (
                    <div
                      key={day.weekday}
                      className="flex items-center justify-between text-[12.5px]"
                    >
                      <span className="text-muted-2">
                        {OPENING_HOURS_WEEKDAY_LABELS[day.weekday]}
                      </span>
                      <span className="font-mono text-ink">
                        {formatOpeningHoursRange(day)}
                      </span>
                    </div>
                  ))}
                  {location.usesDefaultOpeningHours && (
                    <p className="mt-2 text-[11.5px] text-muted">
                      {t("defaultOpeningHoursNote")}
                    </p>
                  )}
                </div>
              )}
            </DetailPanel>

            <DetailPanel
              title={t("activity")}
              eyebrow={
                <span className="rounded-[7px] bg-success/10 px-2 py-[3px] font-mono text-[9.5px] font-semibold tracking-[0.5px] text-success">
                  {t("live")}
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
      {canViewAudit && (
        <div className="mt-4">
          <AuditLogPanel entries={auditEntries} />
        </div>
      )}
    </>
  );
}
