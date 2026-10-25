import CreateEmployeeModal from "@/components/dashboard/employees/CreateEmployeeModal";
import EmployeesTable, { type EmployeeRow } from "@/components/dashboard/employees/EmployeesTable";
import ImportEmployeesModal from "@/components/dashboard/employees/ImportEmployeesModal";
import { DbCard, DbPageHead } from "@/components/dashboard/ui";
import FolderTemplateButton from "@/components/FolderTemplateButton";
import { auth } from "@/lib/auth";
import {
  getEmployeeLimitForTenant,
  getEmployeesForTenant,
  getMyEmployeeHandle,
  previewNextEmployeeNumber,
} from "@/lib/employee-service";
import { employeeProfileGaps, yearsSince, type Employee } from "@/lib/employees";
import { getLocationsForTenant } from "@/lib/location-service";
import { searchParamString } from "@/lib/pagination";
import { hasPermissionLevel } from "@/lib/roles";
import { getRolesForTenant } from "@/lib/role-service";
import { getTeamsForTenant } from "@/lib/team-service";
import {
  getOptionalTenantAccess,
  getTenantPermissions,
  withAccessRedirect,
} from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { ArrowRight } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

export const metadata = {
  title: "Mitarbeiter",
};

const tabs = ["active", "onDuty", "vacation", "absent", "former", "attention"] as const;
type Tab = (typeof tabs)[number];

/** Handlungsbedarf: fehlende Kerndaten oder eine Befristung, die in 90 Tagen endet. */
function needsAttention(employee: Employee, todayIso: string) {
  if (employee.status === "former") return false;

  const coreMissing = !employee.weeklyHours.trim() || !employee.startDate;
  const exitDate = employee.contractDetails?.exitDate ?? "";
  const endsSoon =
    /^\d{4}-\d{2}-\d{2}$/.test(exitDate) &&
    exitDate >= todayIso &&
    exitDate <= new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  return coreMissing || endsSoon || employeeProfileGaps(employee).missing.length >= 3;
}

function matchesTab(employee: EmployeeRow, tab: Tab) {
  switch (tab) {
    case "active":
      return employee.status !== "former";
    case "onDuty":
      return employee.status === "active";
    case "vacation":
      return employee.status === "vacation";
    case "absent":
      return employee.status === "absent";
    case "former":
      return employee.status === "former";
    case "attention":
      return employee.needsAttention;
  }
}

export default async function EmployeesPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/employees">) {
  const { tenant } = await params;
  const query = await searchParams;
  const t = await getTranslations("EmployeesUi");
  const locale = await getLocale();
  const intlLocale = locale === "en" ? "en-GB" : "de-DE";

  // Bei "own"-Sichtbarkeit (z. B. einfaches Mitgliedskonto) gibt es keine
  // Mitarbeiterliste zu zeigen — direkt auf das eigene Profil weiterleiten.
  const employeesAccess = await getOptionalTenantAccess(tenant, "employees", "read");

  if (employeesAccess && employeesAccess.scope === "own") {
    const ownHandle = await getMyEmployeeHandle(tenant);

    redirect(ownHandle ? `/u/${tenant}/employees/${ownHandle}` : `/u/${tenant}/mein-bereich`);
  }

  // Standorte/Teams/Rollen sind nur Zusatzinfo für Filter und Formulare —
  // fehlt dafür die Berechtigung, wird das tolerant übergangen.
  const [locations, teams, roles, employeeNumberPreview, permissions, employeeLimit] = await Promise.all([
    getLocationsForTenant(tenant).catch(() => null).then((value) => value ?? []),
    getTeamsForTenant(tenant).catch(() => null).then((value) => value ?? []),
    getRolesForTenant(tenant).catch(() => null).then((value) => value ?? []),
    previewNextEmployeeNumber(tenant),
    getTenantPermissions(tenant),
    getEmployeeLimitForTenant(tenant).catch(() => null),
  ]);
  const canCreateEmployee = hasPermissionLevel(permissions.employees, "write");
  const canInvite = hasPermissionLevel(permissions.settings, "write");
  const locationNames = locations.map((location) => location.name);
  const teamNames = teams.map((team) => team.name);
  const search = searchParamString(query.search) ?? "";
  const rawLocation = searchParamString(query.location) ?? "";
  // Unbekannter Standort (z. B. manipulierte URL) wird verworfen statt eine
  // leere Liste zu zeigen (QA-Bug BUG-020).
  const locationFilter = rawLocation && locationNames.includes(rawLocation) ? rawLocation : "";
  const teamFilter = searchParamString(query.team) ?? "";
  const contractFilter = searchParamString(query.contract) ?? "";
  const rawTab = searchParamString(query.tab) ?? "";
  const tab: Tab = (tabs as readonly string[]).includes(rawTab) ? (rawTab as Tab) : "active";

  const employees = await withAccessRedirect(tenant, () =>
    getEmployeesForTenant(tenant, { search, location: locationFilter }),
  );

  if (!employees) {
    notFound();
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const memberships = session?.user?.id ? await getTenantsForUser(session.user.id).catch(() => null) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;
  const todayIso = new Date().toISOString().slice(0, 10);
  const rows: EmployeeRow[] = employees
    .filter(
      (employee) =>
        (!teamFilter || (employee.teams?.length ? employee.teams : [employee.team]).includes(teamFilter)) &&
        (!contractFilter || employee.contract === contractFilter),
    )
    .map((employee) => ({ ...employee, needsAttention: needsAttention(employee, todayIso) }));
  const counts = Object.fromEntries(tabs.map((id) => [id, rows.filter((row) => matchesTab(row, id)).length])) as Record<Tab, number>;
  const visible = rows
    .filter((row) => matchesTab(row, tab))
    .sort((a, b) => a.name.localeCompare(b.name, intlLocale));
  const current = employees.filter((employee) => employee.status !== "former");
  const newThisMonth = current.filter((employee) => employee.startDate && employee.startDate >= `${todayIso.slice(0, 7)}-01`).length;
  const tenures = current.map((employee) => yearsSince(employee.startDate)).filter((value): value is number => value !== null);
  const averageTenure = tenures.length ? tenures.reduce((sum, value) => sum + value, 0) / tenures.length : 0;
  const onDuty = current.filter((employee) => employee.status === "active").length;
  const onVacation = current.filter((employee) => employee.status === "vacation").length;
  const absent = current.filter((employee) => employee.status === "absent").length;
  const linked = current.filter((employee) => employee.hasAccount).length;
  const appUsage = current.length ? Math.round((linked / current.length) * 100) : 0;
  const contracts = Array.from(new Set(employees.map((employee) => employee.contract).filter(Boolean))).sort();
  const decimal = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 });
  const tabHref = (id: Tab) => {
    const params = new URLSearchParams();

    if (search) params.set("search", search);
    if (locationFilter) params.set("location", locationFilter);
    if (teamFilter) params.set("team", teamFilter);
    if (contractFilter) params.set("contract", contractFilter);
    if (id !== "active") params.set("tab", id);

    const value = params.toString();

    return `/u/${tenant}/employees${value ? `?${value}` : ""}`;
  };

  return (
    <>
      <DbPageHead
        eyebrow={tenantName}
        title={t("title")}
        subtitle={t("subtitle", { company: tenantName })}
        actions={
          canCreateEmployee ? (
            <>
              <FolderTemplateButton tenant={tenant} />
              <ImportEmployeesModal tenant={tenant} />
              <CreateEmployeeModal
                tenant={tenant}
                locations={locationNames}
                teams={teamNames}
                roles={roles.length > 0 ? roles.map((role) => role.name) : ["Mitarbeiter"]}
                employeeNumberPreview={employeeNumberPreview}
                seats={{ used: current.length, limit: employeeLimit ?? null }}
              />
            </>
          ) : undefined
        }
      />

      <div className="mb-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <DbCard className="db-insight flex flex-col gap-2 p-[18px]">
          <span className="text-[13px] font-medium text-[#6e6e6b]">{t("kpi.employees")}</span>
          <span className="flex items-baseline justify-between gap-2">
            <span className="flex items-baseline gap-1.5">
              <span className="font-display text-[30px] leading-none font-semibold tracking-[-1px]">{current.length}</span>
              <span className="text-[14px] text-[#6e6e6b]">{t("kpi.active")}</span>
            </span>
            {newThisMonth > 0 && (
              <span className="rounded-full bg-[rgba(53,122,82,0.10)] px-2 py-0.5 text-[12px] font-semibold text-[#1f5d2c]">
                {t("kpi.new", { count: newThisMonth })}
              </span>
            )}
          </span>
          <span className="text-[13px] text-[#6e6e6b]">{t("kpi.tenure", { years: decimal.format(averageTenure) })}</span>
        </DbCard>
        <DbCard className="db-insight flex flex-col gap-2 p-[18px]">
          <span className="text-[13px] font-medium text-[#6e6e6b]">{t("kpi.today")}</span>
          <span className="flex items-baseline gap-1.5">
            <span className="font-display text-[30px] leading-none font-semibold tracking-[-1px]">{onDuty}</span>
            <span className="text-[14px] text-[#6e6e6b]">{t("kpi.onDuty")}</span>
          </span>
          <span className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
            {[
              { value: onDuty, color: "#357a52" },
              { value: onVacation, color: "#168a8a" },
              { value: absent, color: "#b4332a" },
            ]
              .filter((part) => part.value > 0)
              .map((part) => (
                <span key={part.color} style={{ flex: part.value, background: part.color }} />
              ))}
          </span>
          <span className="text-[13px] text-[#6e6e6b]">{t("kpi.split", { vacation: onVacation, absent })}</span>
        </DbCard>
        <DbCard className="db-insight relative flex flex-col gap-2 p-[18px]">
          <span className="text-[13px] font-medium text-[#6e6e6b]">{t("kpi.attention")}</span>
          {counts.attention > 0 && <span className="absolute top-[18px] right-[18px] size-2 rounded-full bg-[#e07b00]" />}
          <span className="flex items-baseline gap-1.5">
            <span className="font-display text-[30px] leading-none font-semibold tracking-[-1px]">{counts.attention}</span>
            <span className="text-[14px] text-[#6e6e6b]">{t("kpi.profiles")}</span>
          </span>
          <Link href={tabHref("attention")} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#6b4fc4] no-underline">
            {t("kpi.show")}
            <ArrowRight size={13} />
          </Link>
        </DbCard>
        <DbCard className="db-insight flex items-center gap-4 p-[18px]">
          <span
            className="relative size-[54px] shrink-0 rounded-full"
            style={{ background: `conic-gradient(#8b6ed4 0 ${appUsage}%, #ecebe7 0)` }}
            aria-hidden="true"
          >
            <span className="absolute inset-[6px] rounded-full bg-white" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-[#6e6e6b]">{t("kpi.appUsage")}</span>
            <span className="font-display text-[26px] leading-none font-semibold tracking-[-1px]">{appUsage} %</span>
            <span className="text-[12.5px] text-[#6e6e6b]">{t("kpi.linked", { linked, total: current.length })}</span>
          </span>
        </DbCard>
      </div>

      <DbCard className="overflow-hidden p-0">
        <nav aria-label={t("tabsLabel")} className="flex gap-6 overflow-x-auto border-b border-[#ecebe7] px-5">
          {tabs.map((id) => {
            const active = tab === id;
            const attention = id === "attention";

            return (
              <Link
                key={id}
                href={tabHref(id)}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 py-3.5 text-[14px] whitespace-nowrap no-underline ${
                  active ? "border-[#8b6ed4] font-semibold text-ink" : `border-transparent font-medium ${attention ? "text-[#9a5b00]" : "text-[#6e6e6b]"}`
                }`}
              >
                {t(`tabs.${id}`)}
                {attention ? (
                  counts.attention > 0 && (
                    <span className="rounded-full bg-[#e07b00] px-1.5 text-[11px] font-bold text-white">{counts.attention}</span>
                  )
                ) : (
                  <span className={`text-[12px] ${active ? "text-[#8b6ed4]" : "text-[#9a9a96]"}`}>{counts[id]}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <EmployeesTable
          tenant={tenant}
          employees={visible}
          locations={locationNames}
          teams={teamNames}
          contracts={contracts}
          filters={{ search, location: locationFilter, team: teamFilter, contract: contractFilter }}
          canEdit={canCreateEmployee}
          canInvite={canInvite}
          seats={{ used: current.length, limit: employeeLimit ?? null }}
        />
      </DbCard>
    </>
  );
}
