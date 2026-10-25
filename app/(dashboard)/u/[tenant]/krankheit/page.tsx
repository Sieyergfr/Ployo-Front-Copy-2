import { SicknessReportButton } from "@/components/AbsenceActionButtons";
import { SicknessDrawerButton } from "@/components/ActionDrawers";
import { ctaClass, DbCard, DbPageHead } from "@/components/dashboard/ui";
import { auth } from "@/lib/auth";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { hasPermissionLevel } from "@/lib/roles";
import { getSicknessForTenant, type CurrentSickness, type SicknessHistoryItem } from "@/lib/sickness";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { ChevronRight } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Krankheit",
};

const avatarColors = ["#2a5bc9", "#4a5568", "#1d8a65", "#c9622a", "#7a3c9c", "#b7791f", "#168a8a", "#c23b7a"];

function colorFor(name: string) {
  let hash = 0;

  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;

  return avatarColors[hash % avatarColors.length];
}

const certificateStyles: Record<string, string> = {
  pending: "bg-[#fff7ea] text-[#9a5b00]",
  received: "bg-[rgba(53,122,82,0.10)] text-[#1f5d2c]",
  "not-required": "bg-[#f2f1ed] text-[#6e6e6b]",
};

function Avatar({ name, initials }: { name: string; initials: string }) {
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
      style={{ background: colorFor(name) }}
    >
      {initials}
    </span>
  );
}

const rowClass =
  "db-focus flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#f0efeb] bg-transparent py-3 text-left first:border-t-0 hover:bg-[#fafaf8]";

export default async function SicknessPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/krankheit">) {
  const t = await getTranslations("SicknessUi");
  const { tenant } = await params;
  const query = await searchParams;
  const sickness = await withAccessRedirect(tenant, () => getSicknessForTenant(tenant));
  // Nur für Namen/Standort im Meldungs-Dialog — fehlende Berechtigung dafür
  // soll die Krankheitsübersicht selbst nicht sperren.
  const [employees, capabilities, session] = await Promise.all([
    getEmployeesForTenant(tenant).catch(() => []),
    getTenantCapabilities(tenant),
    auth.api.getSession({ headers: await headers() }),
  ]);
  const memberships = session?.user?.id ? await getTenantsForUser(session.user.id).catch(() => null) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;
  const canManage = hasPermissionLevel(capabilities.sickness.level, "write");
  const canDelete = capabilities.sickness.canDelete;
  // Ausgeschiedene Mitarbeiter erhalten keine neue Krankmeldung (QA-Bug BUG-009).
  const employeeOptions = (employees ?? [])
    .filter((employee) => employee.status !== "former")
    .map((employee) => ({ id: employee.dbId ?? employee.id, name: employee.name, location: employee.location }));
  const filter = query.status === "offen" ? "open" : query.status === "genesen" ? "closed" : "all";
  const history = sickness.history.filter((item) => filter === "all" || item.status === filter);
  const counts = {
    all: sickness.history.length,
    open: sickness.history.filter((item) => item.status === "open").length,
    closed: sickness.history.filter((item) => item.status === "closed").length,
  };
  const maxCount = Math.max(1, ...sickness.chart.map((item) => item.count));
  const certificate = (item: CurrentSickness | SicknessHistoryItem) => (
    <span className={`rounded-[7px] px-2 py-[3px] text-[12px] font-medium ${certificateStyles[item.certificateStatus] ?? certificateStyles.pending}`}>
      {t(`certificate.${item.certificateStatus in certificateStyles ? item.certificateStatus : "pending"}`)}
    </span>
  );

  return (
    <>
      <DbPageHead
        eyebrow={tenantName}
        title={t("title")}
        subtitle={t("subtitle", { company: tenantName })}
        actions={canManage ? <SicknessReportButton tenant={tenant} employees={employeeOptions} className={ctaClass} /> : undefined}
      />

      <div className="mb-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {sickness.metrics.map((metric) => (
          <DbCard key={metric.label} className="db-insight relative flex flex-col gap-2 p-[18px]">
            <span className="text-[13px] font-medium text-[#6e6e6b]">{metric.label}</span>
            {metric.tone === "danger" && <span className="absolute top-[18px] right-[18px] size-2 rounded-full bg-[#b4332a] shadow-[0_0_0_4px_rgba(180,51,42,0.12)]" />}
            <span className={`font-display text-[30px] leading-none font-semibold tracking-[-1px] ${metric.tone === "danger" ? "text-[#b4332a]" : ""}`}>
              {metric.value}
            </span>
            <span className="text-[13px] text-[#6e6e6b]">{metric.caption}</span>
          </DbCard>
        ))}
      </div>

      <div className="mb-5 grid items-stretch gap-5 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        <DbCard className="p-5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <span className="flex flex-col gap-0.5">
              <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.4px]">{t("currentTitle")}</h2>
              <span className="text-[13px] text-[#6e6e6b]">{t("currentSubtitle")}</span>
            </span>
            {sickness.current.length > 0 && (
              <span className="rounded-[7px] bg-[rgba(180,51,42,0.08)] px-2 py-[3px] text-[12px] font-semibold text-[#b4332a]">
                {t("employeeCount", { count: sickness.current.length })}
              </span>
            )}
          </div>
          {sickness.current.length === 0 && <p className="m-0 py-4 text-[13px] text-[#6e6e6b]">{t("nobodySick")}</p>}
          <div className="flex flex-col">
            {sickness.current.map((item) => (
              <SicknessDrawerButton key={item.id} tenant={tenant} item={item} canManage={canManage} canDelete={canDelete} className={rowClass}>
                <Avatar name={item.name} initials={item.initials} />
                <span className="flex min-w-[140px] flex-1 flex-col">
                  <span className="text-[14.5px] font-semibold">{item.name}</span>
                  <span className="text-[12.5px] text-[#6e6e6b]">{t("since", { location: item.location, date: item.since })}</span>
                </span>
                {certificate(item)}
                <span className="text-[14px] font-semibold">{t("days", { count: Number(item.days) || 0 })}</span>
                <span className="rounded-[7px] bg-[rgba(180,51,42,0.08)] px-2 py-[3px] text-[12px] font-medium text-[#b4332a]">{t("running")}</span>
                <ChevronRight size={15} className="text-[#9a9a96]" />
              </SicknessDrawerButton>
            ))}
          </div>
        </DbCard>

        <DbCard className="p-5">
          <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.4px]">{t("chartTitle")}</h2>
          <span className="text-[13px] text-[#6e6e6b]">{t("chartSubtitle")}</span>
          <div className="mt-4 flex h-[150px] items-end gap-3">
            {sickness.chart.map((item) => (
              <span key={item.monthIso} className="flex flex-1 flex-col items-center gap-1.5">
                <span className={`text-[12px] font-semibold ${item.current ? "text-ink" : "text-[#6e6e6b]"}`}>{item.count}</span>
                <span
                  className="w-full max-w-[44px] rounded-[7px_7px_3px_3px]"
                  style={{
                    height: `${Math.max(8, (item.count / maxCount) * 110)}px`,
                    background: item.current ? "linear-gradient(180deg, #a78ee8, #8b6ed4)" : "#e8e7e3",
                  }}
                />
                <span className={`font-mono text-[10px] uppercase ${item.current ? "font-semibold text-ink" : "text-[#9a9a96]"}`}>{item.month}</span>
              </span>
            ))}
          </div>
        </DbCard>
      </div>

      <DbCard className="p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.4px]">{t("historyTitle")}</h2>
            <span className="text-[13px] text-[#6e6e6b]">{t("historySubtitle")}</span>
          </span>
          <nav className="inline-flex gap-0.5 rounded-[10px] bg-[#f2f1ed] p-1">
            {(
              [
                ["all", ""],
                ["open", "offen"],
                ["closed", "genesen"],
              ] as const
            ).map(([id, param]) => (
              <Link
                key={id}
                href={`/u/${tenant}/krankheit${param ? `?status=${param}` : ""}`}
                aria-current={filter === id ? "page" : undefined}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-semibold no-underline ${filter === id ? "bg-white text-ink shadow-[0_1px_2px_rgba(14,14,14,0.08)]" : "text-[#6e6e6b]"}`}
              >
                {t(`filters.${id}`)}
                <span className="text-[11.5px] font-normal text-[#9a9a96]">{counts[id]}</span>
              </Link>
            ))}
          </nav>
        </div>
        {history.length === 0 && <p className="m-0 py-4 text-[13px] text-[#6e6e6b]">{t("noHistory")}</p>}
        <div className="flex flex-col">
          {history.map((item) => (
            <SicknessDrawerButton key={item.id} tenant={tenant} item={item} canManage={canManage} canDelete={canDelete} className={rowClass}>
              <Avatar name={item.name} initials={item.initials} />
              <span className="flex min-w-[160px] flex-1 flex-col">
                <span className="text-[14.5px] font-semibold">{item.name}</span>
                <span className="text-[12.5px] text-[#6e6e6b]">
                  {item.location} · {item.startDate} – {item.endDate}
                </span>
              </span>
              {certificate(item)}
              <span className="text-[14px] font-semibold">{t("days", { count: item.dayCount })}</span>
              {item.status === "closed" ? (
                <span className="rounded-[7px] bg-[rgba(53,122,82,0.10)] px-2 py-[3px] text-[12px] font-medium text-[#1f5d2c]">✓ {t("recovered")}</span>
              ) : (
                // Nur eine ausdrücklich abgeschlossene Meldung gilt als genesen (QA-Bug BUG-015).
                <span className="rounded-[7px] bg-[#fff7ea] px-2 py-[3px] text-[12px] font-medium text-[#9a5b00]">{t("periodEnded")}</span>
              )}
              <ChevronRight size={15} className="text-[#9a9a96]" />
            </SicknessDrawerButton>
          ))}
        </div>
      </DbCard>
    </>
  );
}
