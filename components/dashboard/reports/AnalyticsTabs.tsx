import {
  ColumnChart,
  PersonAvatar,
  Pill,
  ReportCardHead,
  ReportKpi,
  ReportKpiRow,
  formatNumber,
  formatSignedHours,
  signedTone,
} from "@/components/dashboard/reports/ReportBits";
import { DbCard } from "@/components/dashboard/ui";
import {
  OVERTIME_HIGH_MINUTES,
  OVERTIME_LOW_MINUTES,
  ARBZG_MIN_SUNDAYS_OFF,
  weekdayIndex,
} from "@/lib/report-analytics-core";
import {
  describeArbzgFinding,
  type ArbzgAnalytics,
  type OvertimeAnalytics,
  type SicknessAnalytics,
  type StaffAnalytics,
  type VacationAccountAnalytics,
} from "@/lib/report-analytics";
import { isoWeekOfIsoDate } from "@/lib/time-tracking";
import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

function monthShort(month: string, locale: string) {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString(locale, { month: "short", timeZone: "UTC" }).replace(".", "");
}

function dateShort(iso: string, locale: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

function employeeHref(tenant: string, key: string) {
  return `/u/${tenant}/employees/${key}`;
}

// ---------------------------------------------------------------------------
// Überstunden
// ---------------------------------------------------------------------------

export async function OvertimeTab({ tenant, data }: { tenant: string; data: OvertimeAnalytics }) {
  const t = await getTranslations("ReportAnalytics");
  const locale = await getLocale();
  const maxAbs = Math.max(60, ...data.accounts.map((account) => Math.abs(account.total)));
  const sparkMax = Math.max(60, ...data.accounts.flatMap((account) => account.monthly.map(Math.abs)));
  const first = monthShort(data.months[0], locale);
  const last = monthShort(data.months.at(-1)!, locale);

  return (
    <>
      <ReportKpiRow>
        <ReportKpi
          label={t("overtimeTotal")}
          value={formatSignedHours(data.summary.total, locale)}
          unit={t("hoursUnit")}
          tone={signedTone(data.summary.total)}
          caption={t("overtimeTotalCaption")}
          hint={t("overtimeHint")}
        />
        <ReportKpi
          label={t("overtimeAverage")}
          value={formatSignedHours(data.summary.average, locale)}
          unit={t("hoursUnit")}
          caption={t("accounts", { count: data.accounts.length })}
        />
        <ReportKpi
          label={t("overtimeHigh")}
          value={data.summary.high}
          unit={t("employeesShort")}
          tone={data.summary.high > 0 ? "text-[#c2571f]" : ""}
          caption={t("overtimeHighCaption")}
        />
        <ReportKpi
          label={t("overtimeLow")}
          value={data.summary.low}
          unit={t("employeesShort")}
          tone={data.summary.low > 0 ? "text-[#b4332a]" : ""}
          caption={t("overtimeLowCaption")}
        />
      </ReportKpiRow>

      <DbCard className="mb-4 p-[18px]">
        <ReportCardHead title={t("saldoTrend")} subtitle={t("saldoTrendSubtitle", { month: last })} />
        <ColumnChart
          label={t("saldoTrend")}
          items={data.months.map((month, index) => ({
            key: month,
            label: monthShort(month, locale),
            value: data.monthTotals[index],
            display: formatSignedHours(data.monthTotals[index], locale),
          }))}
          color={(value) => (value < 0 ? "rgba(180,51,42,0.55)" : "rgba(47,122,74,0.6)")}
          highlight={(value) => (value < 0 ? "#b4332a" : "#2f7a4a")}
        />
      </DbCard>

      <DbCard className="overflow-hidden p-0">
        <div className="px-[18px] pt-[18px]">
          <ReportCardHead title={t("accountsTitle")} subtitle={t("accountsSubtitle", { month: first })} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
            <thead>
              <tr className="border-y border-[#ecebe7] bg-[#fafaf8] font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">
                <th className="py-2.5 pr-3 pl-[18px] text-left font-normal">{t("columnEmployee")}</th>
                <th className="px-3 py-2.5 text-right font-normal">{monthShort(data.months.at(-1)!, locale)}</th>
                <th className="w-[26%] px-3 py-2.5 font-normal" />
                <th className="px-3 py-2.5 text-right font-normal">{t("columnSaldo")}</th>
                <th className="px-3 py-2.5 text-left font-normal">{t("columnRange", { from: first, to: last })}</th>
                <th className="pr-[18px]" />
              </tr>
            </thead>
            <tbody>
              {data.accounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#6e6e6b]">
                    {t("noData")}
                  </td>
                </tr>
              )}
              {data.accounts.map((account) => {
                const width = (Math.abs(account.total) / maxAbs) * 50;

                return (
                  <tr key={account.id} className="border-b border-[#f0efeb] last:border-b-0">
                    <td className="py-2.5 pr-3 pl-[18px]">
                      <Link href={employeeHref(tenant, account.key)} className="flex items-center gap-2.5 text-ink no-underline">
                        <PersonAvatar id={account.id} initials={account.initials} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold">{account.name}</span>
                          <span className="truncate text-[12px] text-[#6e6e6b]">
                            {[account.contract, account.weeklyHours].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${signedTone(account.current)}`}>
                      {formatSignedHours(account.current, locale, 2)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="relative block h-2 rounded-full bg-[#f0efeb]">
                        <span className="absolute top-[-2px] left-1/2 h-3 w-px bg-[#dcdbd6]" />
                        <span
                          className="absolute top-0 h-2 rounded-full"
                          style={{
                            width: `${Math.max(1, width)}%`,
                            left: account.total >= 0 ? "50%" : `${50 - Math.max(1, width)}%`,
                            background: account.total >= 0 ? "#2f7a4a" : "#b4332a",
                          }}
                        />
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${signedTone(account.total)}`}>
                      {formatSignedHours(account.total, locale, 2)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex h-6 items-center gap-[3px]" aria-hidden="true">
                        {account.monthly.map((value, index) => (
                          <span
                            key={data.months[index]}
                            className="w-[7px] rounded-[2px]"
                            style={{
                              height: Math.abs(value) < 30 ? 2 : Math.max(4, (Math.abs(value) / sparkMax) * 24),
                              background: Math.abs(value) < 30 ? "#c9c8c3" : value > 0 ? "#2f7a4a" : "#b4332a",
                            }}
                          />
                        ))}
                      </span>
                    </td>
                    <td className="py-2.5 pr-[18px] pl-3 text-right">
                      {account.total > OVERTIME_HIGH_MINUTES ? (
                        <Pill tone="amber">{t("planReduction")}</Pill>
                      ) : account.total < OVERTIME_LOW_MINUTES ? (
                        <Pill tone="red">{t("minusHours")}</Pill>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DbCard>
      <p className="mt-3 text-[12px] leading-[1.5] text-[#9a9a96]">{t("overtimeLegend")}</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Abwesenheiten
// ---------------------------------------------------------------------------

export async function AbsencesTab({
  tenant,
  sickness,
  vacation,
}: {
  tenant: string;
  sickness: SicknessAnalytics | null;
  vacation: VacationAccountAnalytics | null;
}) {
  const t = await getTranslations("ReportAnalytics");
  const locale = await getLocale();
  const weekdays = t("weekdays").split(",");
  const topWeekday = sickness ? sickness.startsByWeekday.indexOf(Math.max(...sickness.startsByWeekday)) : -1;
  const maxEntitlement = Math.max(1, ...(vacation?.accounts ?? []).map((account) => account.entitlement));

  return (
    <>
      <ReportKpiRow>
        {sickness && (
          <>
            <ReportKpi
              label={t("sicknessRateMonth", { month: monthShort(sickness.months.at(-1)!, locale) })}
              value={formatNumber(sickness.rates.at(-1) ?? 0, locale)}
              unit="%"
              tone="text-[#b4332a]"
              caption={t("sickWorkdays", { count: sickness.currentSickWorkdays })}
              hint={t("sicknessRateHint")}
            />
            <ReportKpi
              label={t("sickDays")}
              value={sickness.calendarDays}
              unit={t("daysUnit")}
              caption={t("sickDaysCaption", { month: monthShort(sickness.months[0], locale) })}
            />
          </>
        )}
        {vacation && (
          <>
            <ReportKpi label={t("vacationTaken")} value={vacation.taken} unit={t("daysUnit")} caption={t("vacationYear", { year: vacation.year })} />
            <ReportKpi
              label={t("vacationRemaining")}
              value={vacation.remaining}
              unit={t("daysUnit")}
              tone="text-[#c2571f]"
              caption={
                vacation.expiringCarryover > 0 && vacation.expiringAt
                  ? t("carryoverExpires", { count: vacation.expiringCarryover, date: dateShort(vacation.expiringAt, locale) })
                  : t("noCarryover")
              }
            />
          </>
        )}
      </ReportKpiRow>

      {sickness && (
        <section className="mb-4 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
          <DbCard className="p-[18px]">
            <ReportCardHead title={t("sicknessByMonth")} subtitle={t("sicknessByMonthSubtitle")} />
            <ColumnChart
              label={t("sicknessByMonth")}
              items={sickness.months.map((month, index) => ({
                key: month,
                label: monthShort(month, locale),
                value: sickness.rates[index],
                display: `${formatNumber(sickness.rates[index], locale)} %`,
              }))}
              color={() => "rgba(180,51,42,0.42)"}
              highlight={() => "#b4332a"}
            />
          </DbCard>
          <DbCard className="flex flex-col p-[18px]">
            <ReportCardHead title={t("startByWeekday")} subtitle={t("startByWeekdaySubtitle", { month: monthShort(sickness.months[0], locale) })} />
            <div className="flex flex-1 items-end gap-2">
              {sickness.startsByWeekday.map((count, index) => {
                const max = Math.max(1, ...sickness.startsByWeekday);

                return (
                  <div key={weekdays[index]} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[12px] font-semibold tabular-nums">{count}</span>
                    <span
                      className="w-full max-w-[44px] rounded-[6px]"
                      style={{
                        height: Math.max(6, (count / max) * 90),
                        background: index === topWeekday && count > 0 ? "#8b6fe0" : "rgba(139,111,224,0.28)",
                      }}
                    />
                    <span className="font-mono text-[10px] tracking-[0.08em] text-[#9a9a96] uppercase">{weekdays[index]}</span>
                  </div>
                );
              })}
            </div>
            {sickness.totalStarts > 0 && (
              <p className="m-0 mt-3 rounded-[9px] bg-[rgba(139,111,224,0.08)] px-3 py-2 text-[13px] text-[#3d3d3a]">
                {t("startByWeekdayHint", { weekday: t(`weekdayLong.${topWeekday}`) })}
              </p>
            )}
          </DbCard>
        </section>
      )}

      {vacation && (
        <DbCard className="overflow-hidden p-0">
          <div className="px-[18px] pt-[18px]">
            <ReportCardHead title={t("vacationAccounts")} subtitle={t("vacationAccountsSubtitle")} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
              <thead>
                <tr className="border-y border-[#ecebe7] bg-[#fafaf8] font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">
                  <th className="py-2.5 pr-3 pl-[18px] text-left font-normal">{t("columnEmployee")}</th>
                  <th className="w-[28%] px-3 py-2.5 text-left font-normal">{t("columnUsage")}</th>
                  <th className="px-3 py-2.5 text-right font-normal">{t("columnEntitlement")}</th>
                  <th className="px-3 py-2.5 text-right font-normal">{t("columnTaken")}</th>
                  <th className="px-3 py-2.5 text-right font-normal">{t("columnRequested")}</th>
                  <th className="px-3 py-2.5 text-right font-normal">{t("columnRest")}</th>
                  <th className="pr-[18px]" />
                </tr>
              </thead>
              <tbody>
                {vacation.accounts.map((account) => {
                  const scale = (value: number) => `${(Math.max(0, value) / maxEntitlement) * 100}%`;

                  return (
                    <tr key={account.id} className="border-b border-[#f0efeb] last:border-b-0">
                      <td className="py-2.5 pr-3 pl-[18px]">
                        <Link href={employeeHref(tenant, account.key)} className="flex items-center gap-2.5 text-ink no-underline">
                          <PersonAvatar id={account.id} initials={account.initials} />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-semibold">{account.name}</span>
                            {account.carryover > 0 && account.carryoverExpiresAt && (
                              <span className="text-[12px] text-[#c2571f]">
                                {t("carryoverUntil", { count: account.carryover, date: dateShort(account.carryoverExpiresAt, locale).slice(0, 6) })}
                              </span>
                            )}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex h-2 overflow-hidden rounded-full bg-[#f0efeb]" style={{ width: scale(account.entitlement) }}>
                          <span className="h-full bg-[#2f7a4a]" style={{ width: `${(account.taken / Math.max(1, account.entitlement)) * 100}%` }} />
                          <span
                            className="h-full"
                            style={{
                              width: `${(account.requested / Math.max(1, account.entitlement)) * 100}%`,
                              background: "repeating-linear-gradient(135deg,#e07b00 0 3px,#f6c27a 3px 6px)",
                            }}
                          />
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{account.entitlement}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{account.taken}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{account.requested}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{account.remaining}</td>
                      <td className="py-2.5 pr-[18px] pl-3 text-right">
                        {account.requested === 0 && account.remaining >= 10 && <Pill tone="amber">{t("unplanned", { count: account.remaining })}</Pill>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-[#ecebe7] px-[18px] py-3 text-[12.5px] text-[#6e6e6b]">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-[#2f7a4a]" />
              {t("legendTaken")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ background: "repeating-linear-gradient(135deg,#e07b00 0 2px,#f6c27a 2px 4px)" }} />
              {t("legendRequested")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-[#f0efeb]" />
              {t("legendOpen")}
            </span>
          </div>
        </DbCard>
      )}

      {!sickness && !vacation && <DbCard className="py-10 text-center text-[#6e6e6b]">{t("noPermission")}</DbCard>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Arbeitszeitgesetz
// ---------------------------------------------------------------------------

const RULE_TONE = { maxDaily: "red", rest: "red", break: "amber", weekly: "red" } as const;
const RULE_PARAGRAPH = { maxDaily: "§3", weekly: "§3", break: "§4", rest: "§5" } as const;

export async function ArbzgTab({ tenant, data }: { tenant: string; data: ArbzgAnalytics }) {
  const t = await getTranslations("ReportAnalytics");
  const locale = await getLocale();
  const weekdays = t("weekdays").split(",");
  const count = (rule: keyof typeof RULE_TONE) => data.findings.filter((finding) => finding.rule === rule);
  const inPlan = (rule: keyof typeof RULE_TONE) => count(rule).filter((finding) => finding.source === "plan").length;
  const kpi = (rule: keyof typeof RULE_TONE, label: string) => {
    const total = count(rule).length;
    const plan = inPlan(rule);

    return (
      <ReportKpi
        key={rule}
        label={label}
        value={total}
        tone={total === 0 ? "text-[#2f7a4a]" : rule === "break" ? "text-[#c2571f]" : "text-[#b4332a]"}
        caption={`${RULE_PARAGRAPH[rule]} ArbZG${plan > 0 ? ` · ${t("inPlan", { count: plan })}` : ""}`}
      />
    );
  };
  const sundayLimit = 52 - ARBZG_MIN_SUNDAYS_OFF;

  return (
    <>
      <ReportKpiRow>
        {kpi("maxDaily", t("ruleMaxDaily"))}
        {kpi("rest", t("ruleRest"))}
        {kpi("break", t("ruleBreak"))}
        {kpi("weekly", t("ruleWeekly"))}
      </ReportKpiRow>

      <DbCard className="mb-4 overflow-hidden p-0">
        <div className="px-[18px] pt-[18px]">
          <ReportCardHead
            title={t("findings", { count: data.findings.length })}
            subtitle={t("findingsRange", {
              timeFrom: dateShort(data.timeRange.from, locale),
              timeTo: dateShort(data.timeRange.to, locale),
              planFrom: dateShort(data.planRange.from, locale),
              planTo: dateShort(data.planRange.to, locale),
            })}
          />
        </div>
        {data.findings.length === 0 ? (
          <p className="m-0 border-t border-[#ecebe7] px-[18px] py-8 text-center text-[13.5px] text-[#2f7a4a]">{t("noFindings")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
              <thead>
                <tr className="border-y border-[#ecebe7] bg-[#fafaf8] font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">
                  <th className="py-2.5 pr-3 pl-[18px] text-left font-normal">{t("columnDate")}</th>
                  <th className="px-3 py-2.5 text-left font-normal">{t("columnEmployee")}</th>
                  <th className="px-3 py-2.5 text-left font-normal">{t("columnRule")}</th>
                  <th className="px-3 py-2.5 text-left font-normal">{t("columnDetails")}</th>
                  <th className="px-3 py-2.5 text-left font-normal">{t("columnSource")}</th>
                  <th className="pr-[18px]" />
                </tr>
              </thead>
              <tbody>
                {data.findings.map((finding, index) => (
                  <tr key={`${finding.employee.id}-${finding.rule}-${finding.date}-${index}`} className="border-b border-[#f0efeb] last:border-b-0">
                    <td className="py-3 pr-3 pl-[18px]">
                      <span className="flex flex-col">
                        <span className="font-semibold tabular-nums">{dateShort(finding.date, locale)}</span>
                        <span className="text-[12px] text-[#9a9a96]">{weekdays[weekdayIndex(finding.date)]}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        <PersonAvatar id={finding.employee.id} initials={finding.employee.initials} size={26} />
                        {finding.employee.name}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-col items-start gap-0.5">
                        <Pill tone={RULE_TONE[finding.rule]}>{t(`rule.${finding.rule}`)}</Pill>
                        <span className="font-mono text-[10.5px] text-[#9a9a96]">{RULE_PARAGRAPH[finding.rule]} ArbZG</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#3d3d3a]">{describeArbzgFinding(finding)}</td>
                    <td className="px-3 py-3">
                      {finding.source === "plan" ? <Pill tone="blue">{t("sourcePlan")}</Pill> : <span className="text-[13px] text-[#6e6e6b]">{t("sourceTime")}</span>}
                    </td>
                    <td className="py-3 pr-[18px] pl-2 text-right">
                      <Link
                        href={
                          finding.source === "plan"
                            ? `/u/${tenant}/schichtplanung?year=${isoWeekOfIsoDate(finding.date).year}&week=${isoWeekOfIsoDate(finding.date).week}`
                            : `/u/${tenant}/zeiterfassung?date=${finding.date}`
                        }
                        aria-label={t("open")}
                        className="db-act inline-flex size-8 items-center justify-center rounded-[8px] border border-[#ecebe7] bg-white text-ink"
                      >
                        <ArrowRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DbCard>

      <DbCard className="p-[18px]">
        <ReportCardHead title={t("sundays")} subtitle={t("sundaysSubtitle")} />
        {data.sundays.length === 0 ? (
          <p className="m-0 text-[13.5px] text-[#6e6e6b]">{t("noSundays")}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.sundays.map((entry) => (
              <div key={entry.id} className="grid items-center gap-3 sm:grid-cols-[200px_1fr_220px]">
                <span className="flex items-center gap-2">
                  <PersonAvatar id={entry.id} initials={entry.initials} size={26} />
                  {entry.name}
                </span>
                <span className="relative block h-2 rounded-full bg-[#f0efeb]">
                  <span
                    className="absolute top-0 left-0 h-2 rounded-full"
                    style={{ width: `${Math.min(100, ((52 - entry.projectedOff) / sundayLimit) * 100)}%`, background: entry.projectedOff < ARBZG_MIN_SUNDAYS_OFF ? "#b4332a" : "#2f7a4a" }}
                  />
                  <span className="absolute top-[-3px] right-0 h-[14px] w-[2px] rounded bg-[#b4332a]" />
                </span>
                <span className="text-[12.5px] text-[#6e6e6b]">
                  {t("sundaysWorked", { count: entry.worked, month: monthShort(data.sundaysSince.slice(0, 7), locale) })} ·{" "}
                  <span className={`font-semibold ${entry.projectedOff < ARBZG_MIN_SUNDAYS_OFF ? "text-[#b4332a]" : "text-[#2f7a4a]"}`}>
                    {t("sundaysOff", { count: entry.projectedOff })}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </DbCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------------

const CONTRACT_COLORS = ["#0e0e0e", "#2c64c9", "#8b6fe0", "#1f8a7a", "#c2571f", "#9a9a96"];
const LOCATION_COLORS = ["#1f8a7a", "#2c64c9", "#8b6fe0", "#2f7a4a", "#c2571f", "#4a5568"];

export async function StaffTab({ tenant, data, today }: { tenant: string; data: StaffAnalytics; today: string }) {
  const t = await getTranslations("ReportAnalytics");
  const locale = await getLocale();
  const contractTotal = Math.max(1, data.contracts.reduce((sum, item) => sum + item.count, 0));
  const locationMax = Math.max(1, ...data.locations.map((item) => item.count));
  const daysUntil = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const deadlineTone = { fixedTermEnd: "text-[#c2571f]", probationEnd: "text-[#2c64c9]", anniversary: "text-[#2f7a4a]" } as const;

  return (
    <>
      <ReportKpiRow>
        <ReportKpi label={t("activeEmployees")} value={data.active} caption={t("fullPartTime", { full: data.fullTime, part: data.partTime })} />
        <ReportKpi label={t("entries")} value={data.entries} tone="text-[#2f7a4a]" caption={t("last12Months")} />
        <ReportKpi label={t("exits")} value={data.exits} tone={data.exits > 0 ? "text-[#b4332a]" : ""} caption={t("last12Months")} />
        <ReportKpi label={t("turnover")} value={formatNumber(data.turnover, locale)} unit="%" caption={t("turnoverCaption")} hint={t("turnoverHint")} />
        <ReportKpi
          label={t("tenure")}
          value={data.averageTenure === null ? "–" : formatNumber(data.averageTenure, locale)}
          unit={data.averageTenure === null ? undefined : t("yearsUnit")}
          caption={t("tenureCaption")}
        />
      </ReportKpiRow>

      <section className="mb-4 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <DbCard className="p-[18px]">
          <ReportCardHead title={t("headcount")} subtitle={t("headcountSubtitle")} />
          <ColumnChart
            label={t("headcount")}
            height={190}
            items={data.headcount.map((item) => ({ key: item.month, label: monthShort(item.month, locale), value: item.count, display: String(item.count) }))}
            color={() => "rgba(139,111,224,0.3)"}
            highlight={() => "#8b6fe0"}
          />
        </DbCard>
        <DbCard className="p-[18px]">
          <ReportCardHead title={t("contracts")} subtitle={t("contractsSubtitle")} />
          <div className="mb-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
            {data.contracts.map((item, index) => (
              <span key={item.label} style={{ width: `${(item.count / contractTotal) * 100}%`, background: CONTRACT_COLORS[index % CONTRACT_COLORS.length] }} />
            ))}
          </div>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {data.contracts.map((item, index) => (
              <li key={item.label} className="flex items-center gap-2 text-[13.5px]">
                <span className="size-2 rounded-[2px]" style={{ background: CONTRACT_COLORS[index % CONTRACT_COLORS.length] }} />
                <span className="flex-1">{item.label}</span>
                <span className="text-[#6e6e6b] tabular-nums">
                  {item.count} · {Math.round((item.count / contractTotal) * 100)} %
                </span>
              </li>
            ))}
          </ul>
          {data.locations.length > 0 && (
            <>
              <div className="mt-4 mb-2.5 border-t border-[#f0efeb] pt-3 font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">{t("byLocation")}</div>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {data.locations.map((item, index) => (
                  <li key={item.label} className="grid grid-cols-[120px_1fr_24px] items-center gap-3 text-[13.5px]">
                    <span className="truncate">{item.label}</span>
                    <span className="h-1.5 rounded-full bg-[#f0efeb]">
                      <span className="block h-1.5 rounded-full" style={{ width: `${(item.count / locationMax) * 100}%`, background: LOCATION_COLORS[index % LOCATION_COLORS.length] }} />
                    </span>
                    <span className="text-right font-semibold tabular-nums">{item.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DbCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <DbCard className="p-[18px]">
          <ReportCardHead title={t("deadlines")} subtitle={t("deadlinesSubtitle")} />
          {data.deadlines.length === 0 ? (
            <p className="m-0 text-[13.5px] text-[#6e6e6b]">{t("noDeadlines")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {data.deadlines.map((deadline) => (
                <li key={`${deadline.employee.id}-${deadline.kind}-${deadline.date}`} className="border-b border-[#f0efeb] last:border-b-0">
                  <Link href={employeeHref(tenant, deadline.employee.key)} className="flex items-center gap-3 rounded-[8px] py-2.5 text-ink no-underline hover:bg-[#fafaf8]">
                    <PersonAvatar id={deadline.employee.id} initials={deadline.employee.initials} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">{deadline.employee.name}</span>
                      <span className={`text-[12.5px] font-medium ${deadlineTone[deadline.kind]}`}>
                        {deadline.kind === "anniversary" ? t("anniversary", { years: deadline.years ?? 0 }) : t(`deadline.${deadline.kind}`)}
                      </span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="font-semibold tabular-nums">{dateShort(deadline.date, locale)}</span>
                      <span className="text-[12px] text-[#9a9a96]">{t("inDays", { count: daysUntil(deadline.date) })}</span>
                    </span>
                    <ChevronRight size={16} className="text-[#9a9a96]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DbCard>
        <DbCard className="p-[18px]">
          <ReportCardHead title={t("movements")} subtitle={t("last12Months")} />
          {data.movements.length === 0 ? (
            <p className="m-0 text-[13.5px] text-[#6e6e6b]">{t("noMovements")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {data.movements.map((movement) => (
                <li key={`${movement.employee.id}-${movement.kind}`} className="flex gap-2.5">
                  <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${movement.kind === "entry" ? "bg-[#2f7a4a]" : "bg-[#b4332a]"}`} />
                  <span className="flex flex-col">
                    <span className="text-[13.5px]">
                      <span className="font-semibold">{movement.employee.name}</span>
                      <span className={movement.kind === "entry" ? "text-[#2f7a4a]" : "text-[#b4332a]"}>
                        {" · "}
                        {t(movement.kind === "entry" ? "entry" : "exit")}
                      </span>
                    </span>
                    <span className="text-[12px] text-[#9a9a96]">{dateShort(movement.date, locale)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DbCard>
      </section>
    </>
  );
}
