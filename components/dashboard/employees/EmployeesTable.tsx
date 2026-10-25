"use client";

import { InviteToAppButton } from "@/components/dashboard/employees/EmployeeAccessButtons";
import { DbDrawer } from "@/components/dashboard/DbDrawer";
import EmployeeInfoRequestButton from "@/components/EmployeeInfoRequestButton";
import { employeeProfileGaps, yearsSince, type Employee } from "@/lib/employees";
import { Check, ChevronDown, ChevronRight, Lock, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export type EmployeeRow = Employee & { needsAttention: boolean };

const avatarColors = ["#2a5bc9", "#4a5568", "#1d8a65", "#c9622a", "#7a3c9c", "#b7791f", "#168a8a", "#c23b7a"];

function colorFor(name: string) {
  let hash = 0;

  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;

  return avatarColors[hash % avatarColors.length];
}

const statusStyles: Record<Employee["status"], { color: string; bg: string; dot: string }> = {
  active: { color: "#1f5d2c", bg: "rgba(53,122,82,0.10)", dot: "#357a52" },
  vacation: { color: "#16707a", bg: "rgba(22,138,138,0.10)", dot: "#168a8a" },
  absent: { color: "#b4332a", bg: "rgba(180,51,42,0.08)", dot: "#b4332a" },
  former: { color: "#6e6e6b", bg: "#f2f1ed", dot: "#8f8f8a" },
};

export function EmployeeStatusChip({ status, label }: { status: Employee["status"]; label: string }) {
  const style = statusStyles[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[7px] px-2 py-[3px] text-[12px] font-medium whitespace-nowrap"
      style={{ color: style.color, background: style.bg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: style.dot }} />
      {label}
    </span>
  );
}

export function EmployeeAvatar({ employee, size = 36 }: { employee: Pick<Employee, "name" | "initials" | "hasAccount">; size?: number }) {
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex size-full items-center justify-center rounded-full font-display font-bold text-white"
        style={{ background: colorFor(employee.name), fontSize: size * 0.36 }}
      >
        {employee.initials}
      </span>
      {employee.hasAccount && (
        <span className="absolute -right-0.5 -bottom-0.5 flex size-[15px] items-center justify-center rounded-full bg-[#357a52] text-white shadow-[0_0_0_2px_#ffffff]">
          <Check size={9} strokeWidth={3.5} />
        </span>
      )}
    </span>
  );
}

function FilterSelect({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: string[];
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <span className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        className="db-input box-border h-[42px] cursor-pointer appearance-none rounded-[10px] border border-[#e4e3df] bg-white py-0 pr-9 pl-3 text-[14px] font-medium text-ink"
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[#6e6e6b]" />
    </span>
  );
}

function ProfileDrawer({
  tenant,
  employee,
  canEdit,
  canInvite,
  onClose,
}: {
  tenant: string;
  employee: EmployeeRow;
  canEdit: boolean;
  canInvite: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("EmployeesUi");
  const locale = useLocale();
  const [tab, setTab] = useState<"overview" | "personal" | "contract">("overview");
  const gaps = employeeProfileGaps(employee);
  const years = yearsSince(employee.startDate);
  const href = `/u/${tenant}/employees/${employee.id}`;
  const dateFormat = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const formatDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? dateFormat.format(new Date(`${value}T12:00:00Z`)) : value || "–";
  const rows = (items: Array<[string, string]>) => (
    <dl className="m-0 flex flex-col">
      {items.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 border-b border-[#ecebe7] py-2.5 text-[14px]">
          <dt className="text-[#6e6e6b]">{label}</dt>
          <dd className="m-0 break-words text-ink">{value || "–"}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <DbDrawer
      width={520}
      onClose={onClose}
      title={
        <span className="flex items-center gap-3">
          <EmployeeAvatar employee={employee} size={52} />
          <span className="flex flex-col">
            <span>{employee.name}</span>
            <span className="text-[13px] font-normal tracking-normal text-[#6e6e6b]">
              {[employee.employeeNumber, employee.role, years !== null ? t("sinceYears", { years: Math.floor(years) }) : ""]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </span>
      }
      footer={
        <div className="flex gap-2">
          {canEdit && (
            <Link
              href={`${href}?tab=data&edit=1`}
              className="db-btn2 db-focus flex min-h-11 flex-1 items-center justify-center rounded-[10px] border border-[#ecebe7] bg-[#f2f1ed] text-[14px] font-semibold text-ink no-underline"
            >
              {t("edit")}
            </Link>
          )}
          <Link
            href={href}
            className="db-cta db-focus relative flex min-h-11 flex-[1.4] items-center justify-center overflow-hidden rounded-[10px] border border-[rgba(167,142,232,0.45)] bg-ink text-[14px] font-semibold text-white no-underline"
          >
            <span>{t("openRecord")}</span>
          </Link>
        </div>
      }
    >
      <div className="-mt-1 flex flex-wrap items-center gap-2">
        <EmployeeStatusChip status={employee.status} label={t(`status.${employee.status}`)} />
        {(employee.locations?.length ? employee.locations : [employee.location]).filter(Boolean).map((location) => (
          <span key={location} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#ecebe7] bg-white px-2 py-[3px] text-[12px]">
            <span className="size-1.5 rounded-[2px] bg-[#8b6ed4]" />
            {location}
          </span>
        ))}
        {employee.appAccessLockedAt && (
          <span className="inline-flex items-center gap-1 rounded-[7px] bg-[rgba(180,51,42,0.08)] px-2 py-[3px] text-[12px] font-medium text-[#b4332a]">
            <Lock size={11} />
            {t("accessLocked")}
          </span>
        )}
        {!employee.hasAccount && employee.email && canInvite && (
          <InviteToAppButton
            tenant={tenant}
            employeeHandle={employee.id}
            label={t("inviteToApp")}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] border border-[rgba(139,110,212,0.35)] bg-[rgba(139,110,212,0.08)] px-2 py-[3px] text-[12px] font-medium text-[#6b4fc4]"
          />
        )}
      </div>

      <div role="tablist" className="flex gap-5 border-b border-[#ecebe7]">
        {(["overview", "personal", "contract"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px cursor-pointer border-b-2 py-2 text-[14px] ${tab === id ? "border-[#8b6ed4] font-semibold text-ink" : "border-transparent text-[#6e6e6b]"}`}
          >
            {t(`drawerTabs.${id}`)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {gaps.missing.length > 0 && (
            <div className="rounded-[14px] border border-[rgba(224,123,0,0.3)] bg-white p-4 shadow-[0_0_0_4px_rgba(224,123,0,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-semibold">{t("profilePercent", { percent: gaps.percent })}</span>
                <span className="text-[12.5px] text-[#9a5b00]">{t("missingCount", { count: gaps.missing.length })}</span>
              </div>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#f2f1ed]">
                <span className="block h-full rounded-full bg-[#8b6ed4]" style={{ width: `${gaps.percent}%` }} />
              </span>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {gaps.missing.map((field) => (
                  <span key={field} className="rounded-[6px] bg-[#f2f1ed] px-2 py-0.5 text-[12px] text-[#3d3d3a]">
                    {t(`fields.${field}`)}
                  </span>
                ))}
              </div>
              {employee.dbId && (
                <div className="mt-3">
                  <EmployeeInfoRequestButton
                    tenant={tenant}
                    employeeId={employee.dbId}
                    employeeHandle={employee.id}
                    employeeName={employee.name}
                    label={t("requestInApp")}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[9px] bg-ink px-3 text-[13px] font-semibold text-white"
                  />
                </div>
              )}
            </div>
          )}
          <section>
            <h3 className="m-0 mb-1 text-[15px] font-semibold">{t("contact")}</h3>
            {rows([
              [t("fields.email"), employee.email],
              [t("fields.phone"), employee.phone],
            ])}
          </section>
          <section>
            <h3 className="m-0 mb-1 text-[15px] font-semibold">{t("organisation")}</h3>
            {rows([
              [t("fields.locations"), (employee.locations?.length ? employee.locations : [employee.location]).filter(Boolean).join(", ")],
              [t("fields.teams"), (employee.teams?.length ? employee.teams : [employee.team]).filter(Boolean).join(", ")],
              [t("fields.employment"), [employee.contract, employee.weeklyHours].filter(Boolean).join(" · ")],
              [t("fields.startDate"), formatDate(employee.startDate)],
              [t("fields.workAddress"), employee.address],
            ])}
          </section>
          <section>
            <h3 className="m-0 mb-2 text-[15px] font-semibold">{t("vacationAccount", { year: new Date().getFullYear() })}</h3>
            <span className="flex items-baseline gap-2">
              <span className="font-display text-[34px] leading-none font-semibold tracking-[-1px]">{employee.vacationRemaining}</span>
              <span className="text-[14px] text-[#6e6e6b]">{t("daysLeft")}</span>
            </span>
            <span className="mt-3 block h-2 overflow-hidden rounded-full bg-[rgba(139,110,212,0.15)]">
              <span
                className="block h-full rounded-full bg-[#8b6ed4]"
                style={{ width: `${employee.vacationTotal > 0 ? Math.min(100, (employee.vacationRemaining / employee.vacationTotal) * 100) : 0}%` }}
              />
            </span>
            <span className="mt-2 flex flex-wrap gap-4 text-[12.5px] text-[#6e6e6b]">
              <span>
                <strong className="text-ink">{employee.vacationTotal}</strong> {t("entitlement")}
              </span>
              {employee.vacationCarryover > 0 && (
                <span>
                  <strong className="text-ink">+{employee.vacationCarryover}</strong> {t("carryover")}
                </span>
              )}
              <span>
                <strong className="text-ink">{employee.vacationTaken}</strong> {t("taken")}
              </span>
            </span>
          </section>
        </>
      )}

      {tab === "personal" &&
        rows([
          [t("fields.birthDate"), formatDate(employee.birthDate)],
          [t("fields.birthPlace"), employee.birthPlace],
          [t("fields.nationality"), employee.nationality],
          [t("fields.maritalStatus"), employee.maritalStatus],
          [t("fields.privateAddress"), employee.privateAddress],
          [t("fields.emergencyContact"), employee.emergencyContacts.map((contact) => `${contact.name} (${contact.phone})`).join(", ")],
        ])}

      {tab === "contract" &&
        rows([
          [t("fields.contract"), employee.contract],
          [t("fields.weeklyHours"), employee.weeklyHours],
          [t("fields.startDate"), formatDate(employee.startDate)],
          [t("fields.role"), employee.role],
          [t("fields.taxId"), employee.taxId],
          [t("fields.socialSecurityNumber"), employee.socialSecurityNumber],
          [t("fields.healthInsurance"), employee.healthInsurance],
          [t("fields.iban"), employee.iban],
        ])}
    </DbDrawer>
  );
}

export default function EmployeesTable({
  tenant,
  employees,
  locations,
  teams,
  contracts,
  filters,
  canEdit,
  canInvite,
  seats,
}: {
  tenant: string;
  employees: EmployeeRow[];
  locations: string[];
  teams: string[];
  contracts: string[];
  filters: { search: string; location: string; team: string; contract: string };
  canEdit: boolean;
  canInvite: boolean;
  seats: { used: number; limit: number | null };
}) {
  const t = useTranslations("EmployeesUi");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.search);
  const [openId, setOpenId] = useState<string | null>(null);
  const debounce = useRef<number | null>(null);
  const openEmployee = employees.find((employee) => employee.id === openId) ?? null;
  const dateFormat = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

  function update(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) params.set(name, value);
    else params.delete(name);

    params.delete("page");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  useEffect(() => () => {
    if (debounce.current) window.clearTimeout(debounce.current);
  }, []);

  function tenureLabel(startDate: string) {
    const years = yearsSince(startDate);

    if (years === null) return "";

    const whole = Math.floor(years);
    const months = Math.floor((years - whole) * 12);

    return whole > 0 ? t("tenure", { years: whole, months }) : t("tenureMonths", { months: Math.max(months, 0) });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 border-b border-[#ecebe7] p-4">
        <label className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[#8f8f8a]" />
          <input
            value={search}
            onChange={(event) => {
              const value = event.target.value;

              setSearch(value);

              if (debounce.current) window.clearTimeout(debounce.current);

              debounce.current = window.setTimeout(() => update("search", value.trim()), 300);
            }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="db-input box-border h-[42px] w-full rounded-[10px] border border-[#e4e3df] bg-[#fafaf8] pr-3 pl-10 text-[14px]"
          />
        </label>
        <FilterSelect name="location" label={t("allLocations")} options={locations} value={filters.location} onChange={update} />
        <FilterSelect name="team" label={t("allTeams")} options={teams} value={filters.team} onChange={update} />
        <FilterSelect name="contract" label={t("allContracts")} options={contracts} value={filters.contract} onChange={update} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr className="font-mono text-[10px] tracking-[0.1em] text-[#6e6e6b] uppercase">
              {["employee", "teamLocation", "employment", "status", "vacation", "startDate"].map((column) => (
                <th key={column} className="px-4 pt-4 pb-2 font-normal">
                  {t(`columns.${column}`)}
                </th>
              ))}
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => {
              const teamsList = (employee.teams?.length ? employee.teams : [employee.team]).filter(Boolean);
              const locationList = (employee.locations?.length ? employee.locations : [employee.location]).filter(Boolean);
              const vacationShare = employee.vacationTotal > 0 ? employee.vacationRemaining / employee.vacationTotal : 0;

              return (
                <tr
                  key={employee.id}
                  tabIndex={0}
                  onClick={() => setOpenId(employee.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setOpenId(employee.id);
                  }}
                  className="db-focus cursor-pointer border-t border-[#f0efeb] transition-colors hover:bg-[#fafaf8]"
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <EmployeeAvatar employee={employee} />
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1.5 truncate text-[14.5px] font-semibold text-ink">
                          {employee.name}
                          {employee.appAccessLockedAt && <Lock size={12} className="text-[#b4332a]" aria-label={t("accessLocked")} />}
                        </span>
                        <span className="truncate text-[12.5px] text-[#6e6e6b]">
                          {[employee.employeeNumber, employee.role].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-col gap-1">
                      <span className="flex flex-wrap gap-1">
                        {teamsList.slice(0, 2).map((team) => (
                          <span key={team} className="rounded-[6px] bg-[#f2f1ed] px-2 py-0.5 text-[12.5px] text-[#3d3d3a]">
                            {team}
                          </span>
                        ))}
                      </span>
                      <span className="flex items-center gap-1.5 text-[12.5px] text-[#6e6e6b]">
                        {locationList[0] && <span className="size-1.5 rounded-[2px] bg-[#2a6fdb]" />}
                        {locationList[0]}
                        {locationList.length > 1 && (
                          <span className="rounded-[5px] bg-[rgba(139,110,212,0.12)] px-1 text-[11px] font-semibold text-[#6b4fc4]">
                            +{locationList.length - 1}
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-col">
                      <span className="text-[14px] text-ink">{employee.contract}</span>
                      <span className="text-[12.5px] text-[#6e6e6b]">{employee.weeklyHours}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <EmployeeStatusChip status={employee.status} label={t(`status.${employee.status}`)} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-col gap-1">
                      <span className="text-[13px]">
                        <strong className="font-semibold text-ink">{employee.vacationRemaining}</strong>
                        <span className="text-[#9a9a96]"> / {employee.vacationTotal}</span>
                      </span>
                      <span className="block h-1 w-[72px] overflow-hidden rounded-full bg-[#f2f1ed]">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.min(100, vacationShare * 100)}%`,
                            background: vacationShare > 0.7 ? "#e07b00" : "#8b6ed4",
                          }}
                        />
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-col">
                      <span className="font-mono text-[13px] text-ink">
                        {/^\d{4}-\d{2}-\d{2}$/.test(employee.startDate)
                          ? dateFormat.format(new Date(`${employee.startDate}T12:00:00Z`))
                          : employee.startDate || "–"}
                      </span>
                      <span className="text-[12px] text-[#6e6e6b]">{tenureLabel(employee.startDate)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center justify-end gap-2">
                      {employee.needsAttention && (
                        <span
                          title={t("needsAttention")}
                          className="flex size-[22px] items-center justify-center rounded-full bg-[#fff1d6] text-[12px] font-bold text-[#e07b00]"
                        >
                          !
                        </span>
                      )}
                      <ChevronRight size={16} className="text-[#9a9a96]" />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {employees.length === 0 && <p className="px-4 py-10 text-center text-[13px] text-[#6e6e6b]">{t("empty")}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ecebe7] px-5 py-3.5 text-[13px] text-[#6e6e6b]">
        <span>{t("personCount", { count: employees.length })}</span>
        {seats.limit !== null && (
          <span className="flex items-center gap-3">
            <span>
              {t.rich("seats", {
                used: seats.used,
                limit: seats.limit,
                b: (chunks) => <strong className="font-semibold text-ink">{chunks}</strong>,
              })}
            </span>
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[#f2f1ed]">
              <span className="block h-full rounded-full bg-[#8b6ed4]" style={{ width: `${Math.min(100, (seats.used / Math.max(1, seats.limit)) * 100)}%` }} />
            </span>
          </span>
        )}
      </div>

      {openEmployee && (
        <ProfileDrawer tenant={tenant} employee={openEmployee} canEdit={canEdit} canInvite={canInvite} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}
