import { VacationRequestButton } from "@/components/AbsenceActionButtons";
import VacationAccountsTable, { type VacationAccountRow } from "@/components/dashboard/vacation/VacationAccountsTable";
import VacationRequestsTable, { type VacationRow } from "@/components/dashboard/vacation/VacationRequestsTable";
import VacationTimeline from "@/components/dashboard/vacation/VacationTimeline";
import { ctaClass, DbCard, DbPageHead } from "@/components/dashboard/ui";
import { auth } from "@/lib/auth";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { getGermanHolidays } from "@/lib/german-holidays";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { getVacationMetrics, getVacationRequestsForTenant } from "@/lib/vacation-service";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

export const metadata = {
  title: "Urlaub",
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function VacationPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/urlaub">) {
  const t = await getTranslations("VacationUi");
  const tMetrics = await getTranslations("VacationPage");
  const locale = await getLocale();
  const intlLocale = locale === "en" ? "en-GB" : "de-DE";
  const { tenant } = await params;
  const query = await searchParams;
  const vacationRequests = await withAccessRedirect(tenant, () => getVacationRequestsForTenant(tenant));

  if (!vacationRequests) {
    notFound();
  }

  // Nur für Namen/Teams, Konten und Kennzahlen — fehlende Berechtigung dafür
  // soll die Urlaubsliste selbst nicht sperren.
  const [employees, capabilities, session] = await Promise.all([
    getEmployeesForTenant(tenant).catch(() => null).then((value) => value ?? []),
    getTenantCapabilities(tenant),
    auth.api.getSession({ headers: await headers() }),
  ]);
  const memberships = session?.user?.id ? await getTenantsForUser(session.user.id).catch(() => null) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;
  const canManage = hasPermissionLevel(capabilities.vacation.level, "write");
  const canDelete = capabilities.vacation.canDelete;
  // Ausgeschiedene Mitarbeiter sind nicht mehr antragsberechtigt (QA-Bug BUG-009).
  const activeEmployees = employees.filter((employee) => employee.status !== "former");
  const metrics = getVacationMetrics(vacationRequests, activeEmployees, tMetrics);
  const employeeOptions = activeEmployees
    .filter((employee) => employee.dbId)
    .map((employee) => ({ id: employee.dbId ?? employee.id, name: employee.name, location: employee.location }));
  const employeeByDbId = new Map(employees.map((employee) => [employee.dbId ?? employee.id, employee]));
  const todayIso = new Date().toISOString().slice(0, 10);
  const view = single(query.ansicht) === "konten" ? "accounts" : "requests";
  const monthParam = single(query.monat);
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayIso.slice(0, 7);
  const firstName = (name: string) => name.trim().split(/\s+/)[0];
  const activeRequests = vacationRequests.filter((request) => request.status !== "rejected");

  // Hinweise je Antrag: Überschneidung im Team, Resturlaub überschritten.
  const rows: VacationRow[] = vacationRequests.map((request) => {
    const hints: VacationRow["hints"] = [];
    const start = request.startDateIso ?? "";
    const end = request.endDateIso ?? start;

    if (request.status !== "rejected" && request.team) {
      const overlapping = activeRequests.filter(
        (other) =>
          other.employeeId !== request.employeeId &&
          other.team === request.team &&
          (other.startDateIso ?? "") <= end &&
          (other.endDateIso ?? "") >= start,
      );

      if (overlapping.length > 0) {
        hints.push({
          text: t("hintOverlap", { names: overlapping.slice(0, 3).map((other) => firstName(other.name)).join(", ") }),
          tone: "warning",
        });
      } else if (request.status === "pending") {
        hints.push({ text: t("hintNoOverlap"), tone: "ok" });
      }
    }

    if (request.status === "pending" && request.employeeId) {
      const employee = employeeByDbId.get(request.employeeId);
      const days = Number.parseInt(request.days, 10) || 0;

      if (employee && days > employee.vacationRemaining) {
        hints.unshift({ text: t("hintExceeds", { days: days - employee.vacationRemaining }), tone: "danger" });
      }
    }

    return { ...request, hints };
  });
  rows.sort((a, b) => {
    const rank = (status: string) => (status === "pending" ? 0 : 1);

    return rank(a.status) - rank(b.status) || (b.startDateIso ?? "").localeCompare(a.startDateIso ?? "");
  });

  // Feiertage (bundesweit) für die Monatsleiste.
  const year = Number(month.slice(0, 4));
  const holidays = getGermanHolidays(year, null);
  const timelineEmployees = employees
    .filter((employee) => employee.dbId)
    .map((employee) => ({
      id: employee.dbId!,
      name: employee.name.split(/\s+/).length > 1 ? `${firstName(employee.name)} ${employee.name.trim().split(/\s+/).at(-1)?.[0]}.` : employee.name,
      initials: employee.initials,
      team: (employee.teams?.length ? employee.teams : [employee.team]).filter(Boolean).join(", "),
    }));
  const shortDate = new Intl.DateTimeFormat(intlLocale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const absences = activeRequests
    .filter((request) => request.employeeId && request.startDateIso)
    .map((request) => ({
      id: request.dbId ?? request.id,
      employeeId: request.employeeId!,
      from: request.startDateIso!,
      to: request.endDateIso || request.startDateIso!,
      pending: request.status === "pending",
      tooltip: `${request.name}: ${shortDate.format(new Date(`${request.startDateIso}T12:00:00Z`))}–${shortDate.format(new Date(`${request.endDateIso || request.startDateIso}T12:00:00Z`))} · ${request.days} · ${t(`status.${request.status}`)}`,
    }));
  const accountRows: VacationAccountRow[] = activeEmployees
    .filter((employee) => employee.dbId)
    .map((employee) => ({
      id: employee.dbId!,
      name: employee.name,
      initials: employee.initials,
      team: (employee.teams?.length ? employee.teams : [employee.team]).filter(Boolean).join(", "),
      total: employee.vacationTotal,
      carryover: employee.vacationCarryover,
      carryoverExpiresAt: employee.vacationCarryoverExpiresAt ?? null,
      carryoverRemindedAt: employee.vacationCarryoverRemindedAt ?? null,
      correction: employee.vacationManualCorrection,
      taken: employee.vacationTaken,
      planned: vacationRequests
        .filter((request) => request.employeeId === employee.dbId && request.status === "approved" && (request.startDateIso ?? "") > todayIso)
        .reduce((sum, request) => sum + (Number.parseInt(request.days, 10) || 0), 0),
      remaining: employee.vacationRemaining,
      hasAccount: Boolean(employee.hasAccount),
    }))
    .sort((a, b) => b.carryover - a.carryover || a.name.localeCompare(b.name, intlLocale));
  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const metricDots = ["#e07b00", "#357a52", null, null];
  const baseQuery = (extra: Record<string, string>) => {
    const params = new URLSearchParams();

    if (monthParam) params.set("monat", month);

    for (const [key, value] of Object.entries(extra)) params.set(key, value);

    const value = params.toString();

    return `/u/${tenant}/urlaub${value ? `?${value}` : ""}`;
  };

  return (
    <>
      <DbPageHead
        eyebrow={tenantName}
        title={t("title")}
        subtitle={t("subtitle", { company: tenantName })}
        actions={canManage ? <VacationRequestButton tenant={tenant} employees={employeeOptions} className={ctaClass} /> : undefined}
      />

      <div className="mb-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {metrics.map((metric, index) => (
          <DbCard key={metric.label} className="db-insight relative flex flex-col gap-2 p-[18px]">
            <span className="text-[13px] font-medium text-[#6e6e6b]">{metric.label}</span>
            {metricDots[index] && <span className="absolute top-[18px] right-[18px] size-2 rounded-full" style={{ background: metricDots[index]! }} />}
            <span className="font-display text-[30px] leading-none font-semibold tracking-[-1px]">{metric.value}</span>
            <span className="text-[13px] text-[#6e6e6b]">{metric.caption}</span>
          </DbCard>
        ))}
      </div>

      <VacationTimeline
        month={month}
        locale={intlLocale}
        absences={absences}
        employees={timelineEmployees}
        holidays={holidays}
        hrefFor={(next) => {
          const params = new URLSearchParams({ monat: next });

          if (view === "accounts") params.set("ansicht", "konten");

          return `/u/${tenant}/urlaub?${params.toString()}`;
        }}
        labels={{
          title: t("timeline.title"),
          subtitle: t("timeline.subtitle"),
          concurrent: t("timeline.concurrent"),
          approved: t("timeline.approved"),
          requested: t("timeline.requested"),
          multipleTeam: t("timeline.multipleTeam"),
          holiday: t("timeline.holiday"),
          previous: t("timeline.previous"),
          next: t("timeline.next"),
          empty: t("timeline.empty"),
        }}
      />

      <DbCard className="overflow-hidden p-0">
        <nav className="flex gap-6 border-b border-[#ecebe7] px-5">
          <Link
            href={baseQuery({})}
            aria-current={view === "requests" ? "page" : undefined}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 py-3.5 text-[14px] no-underline ${view === "requests" ? "border-[#8b6ed4] font-semibold text-ink" : "border-transparent font-medium text-[#6e6e6b]"}`}
          >
            {t("tabRequests")}
            {pendingCount > 0 && <span className="rounded-full bg-[#e07b00] px-1.5 text-[11px] font-bold text-white">{pendingCount}</span>}
          </Link>
          {employees.length > 0 && (
            <Link
              href={baseQuery({ ansicht: "konten" })}
              aria-current={view === "accounts" ? "page" : undefined}
              className={`-mb-px inline-flex items-center border-b-2 py-3.5 text-[14px] no-underline ${view === "accounts" ? "border-[#8b6ed4] font-semibold text-ink" : "border-transparent font-medium text-[#6e6e6b]"}`}
            >
              {t("tabAccounts")}
            </Link>
          )}
        </nav>
        {view === "accounts" ? (
          <VacationAccountsTable tenant={tenant} rows={accountRows} canManage={canManage} />
        ) : (
          <VacationRequestsTable tenant={tenant} rows={rows} canManage={canManage} canDelete={canDelete} />
        )}
      </DbCard>
    </>
  );
}
