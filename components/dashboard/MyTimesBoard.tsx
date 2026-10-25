"use client";

import { TimeCorrectionForm } from "@/components/dashboard/MyQuickActions";
import { useToast } from "@/components/Toasts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type MyTimesDay = {
  date: string;
  workedMinutes: number;
  plannedMinutes: number;
  breakMinutes: number;
  entries: Array<{ clockInTime: string; clockOutTime: string | null; isOpen: boolean; autoClosed: boolean }>;
  shiftStart?: string;
  shiftEnd?: string;
};

export type MyCorrection = {
  id: string;
  date: string;
  requestedStartTime: string;
  requestedEndTime: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  decisionNote: string;
};

function hm(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const value = Math.abs(minutes);

  return `${sign}${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function dayState(day: MyTimesDay, today: string) {
  const missingOut = day.entries.some((entry) => entry.autoClosed || (entry.isOpen && day.date < today));
  const missingDay = day.entries.length === 0 && day.plannedMinutes > 0 && day.date < today;
  const running = day.entries.some((entry) => entry.isOpen) && day.date === today;

  return { missingOut, missingDay, running, incomplete: missingOut || missingDay };
}

export default function MyTimesBoard({
  tenant,
  title,
  rangeLabel,
  days,
  today,
  previousHref,
  nextHref,
  corrections,
}: {
  tenant: string;
  title: string;
  rangeLabel: string;
  days: MyTimesDay[];
  today: string;
  previousHref: string | null;
  nextHref: string | null;
  corrections: MyCorrection[];
}) {
  const t = useTranslations("MyTimes");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const pendingDates = new Set(corrections.filter((item) => item.status === "pending").map((item) => item.date));
  const firstIncomplete = days.find((day) => dayState(day, today).incomplete && !pendingDates.has(day.date));
  const [selected, setSelected] = useState<string>(
    firstIncomplete?.date ?? (days.some((day) => day.date === today) ? today : days[days.length - 1]?.date ?? today),
  );
  const [formKey, setFormKey] = useState(0);
  const selectedDay = days.find((day) => day.date === selected) ?? days[0];
  const maxMinutes = Math.max(8 * 60, ...days.map((day) => Math.max(day.workedMinutes, day.plannedMinutes)));
  const scaleHours = Math.ceil(maxMinutes / 120) * 2;
  const isMonth = days.length > 7;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const dateLabel = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const longDate = new Intl.DateTimeFormat(locale, { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const totals = days.reduce(
    (sum, day) => ({
      worked: sum.worked + day.workedMinutes,
      planned: sum.planned + (day.date <= today ? day.plannedMinutes : 0),
      breaks: sum.breaks + day.breakMinutes,
    }),
    { worked: 0, planned: 0, breaks: 0 },
  );
  const selectedState = selectedDay ? dayState(selectedDay, today) : null;
  const firstEntry = selectedDay?.entries[0];
  const lastEntry = selectedDay?.entries[selectedDay.entries.length - 1];

  async function withdraw(id: string) {
    const response = await fetch(`/api/me/time-corrections/${encodeURIComponent(id)}?tenant=${encodeURIComponent(tenant)}`, {
      method: "DELETE",
    }).catch(() => null);

    if (!response?.ok) {
      toast({ tone: "error", title: t("withdrawError") });
      return;
    }

    toast({ tone: "success", title: t("withdrawn") });
    router.refresh();
  }

  return (
    <>
      <section className="db-card mb-5 rounded-[16px] border border-[#ecebe7] bg-white p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 font-display text-[22px] font-semibold tracking-[-0.5px]">{title}</h2>
            <span className="text-[13px] text-[#6e6e6b]">{rangeLabel}</span>
          </div>
          <div className="flex gap-1.5">
            {[
              { href: previousHref, label: t("previous"), icon: ChevronLeft },
              { href: nextHref, label: t("next"), icon: ChevronRight },
            ].map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-label={item.label}
                  className="db-btn2 db-focus flex size-10 items-center justify-center rounded-[10px] border border-[#ecebe7] bg-[#f2f1ed] text-ink"
                >
                  <item.icon size={16} />
                </Link>
              ) : (
                <span
                  key={item.label}
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center rounded-[10px] border border-[#ecebe7] bg-[#fafaf8] text-[#c9c8c3]"
                >
                  <item.icon size={16} />
                </span>
              ),
            )}
          </div>
        </div>

        <div className="db-mt-grid grid items-start gap-6 [grid-template-columns:minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="relative flex gap-2">
              <div className="db-mt-grid-lines flex h-[240px] w-8 shrink-0 flex-col justify-between pb-0 font-mono text-[9.5px] text-[#9a9a96]">
                {Array.from({ length: 6 }, (_, index) => (
                  <span key={index}>{Math.round(scaleHours - (scaleHours / 5) * index)}h</span>
                ))}
              </div>
              <div className="relative min-w-0 flex-1">
                <div aria-hidden="true" className="absolute inset-x-0 top-0 flex h-[240px] flex-col justify-between">
                  {Array.from({ length: 6 }, (_, index) => (
                    <span key={index} className="border-t border-[#f0efeb]" />
                  ))}
                </div>
                <div className={`relative flex ${isMonth ? "gap-1" : "gap-3"}`}>
                  {days.map((day) => {
                    const state = dayState(day, today);
                    const isSelected = day.date === selected;
                    const isFuture = day.date > today;
                    const plannedHeight = (day.plannedMinutes / (scaleHours * 60)) * 240;
                    const workedHeight = (day.workedMinutes / (scaleHours * 60)) * 240;
                    const diff = day.workedMinutes - day.plannedMinutes;

                    return (
                      <button
                        key={day.date}
                        type="button"
                        aria-pressed={isSelected}
                        title={`${longDate.format(asDate(day.date))}: ${hm(day.workedMinutes)}`}
                        disabled={isFuture}
                        onClick={() => {
                          setSelected(day.date);
                          setFormKey((key) => key + 1);
                        }}
                        className={`db-focus flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 rounded-[12px] border pb-2 disabled:cursor-default ${isSelected ? "border-[rgba(139,110,212,0.45)] bg-[rgba(139,110,212,0.06)]" : "border-transparent"}`}
                      >
                        <span className="relative flex h-[240px] w-full items-end justify-center">
                          {plannedHeight > 0 && (
                            <span
                              className="absolute bottom-0 w-[64%] max-w-[46px] rounded-[8px] bg-[#f6f5f2] shadow-[inset_0_0_0_1px_#ecebe7]"
                              style={{ height: plannedHeight }}
                            />
                          )}
                          {state.incomplete && !state.running ? (
                            <span
                              className="relative flex w-[64%] max-w-[46px] items-start justify-center rounded-[8px] pt-2 shadow-[inset_0_0_0_1.5px_rgba(224,123,0,0.6)]"
                              style={{
                                height: Math.max(plannedHeight, workedHeight, 60),
                                background: "repeating-linear-gradient(135deg, rgba(224,123,0,0.18) 0 4px, rgba(255,247,234,0.9) 4px 9px)",
                              }}
                            >
                              <span className="flex size-[18px] items-center justify-center rounded-full bg-[#e07b00] text-[11px] font-bold text-white">!</span>
                            </span>
                          ) : (
                            workedHeight > 0 && (
                              <span
                                className="relative w-[64%] max-w-[46px] rounded-[8px]"
                                style={{
                                  height: workedHeight,
                                  background: state.running
                                    ? "linear-gradient(180deg, #a78ee8, #8b6ed4)"
                                    : "#8b6ed4",
                                }}
                              />
                            )
                          )}
                        </span>
                        {!isMonth && (
                          <span className="flex flex-col items-center">
                            <span
                              className={`text-[14px] font-semibold ${isFuture || (day.workedMinutes === 0 && !state.incomplete) ? "text-[#9a9a96]" : "text-ink"}`}
                            >
                              {state.incomplete && !state.running
                                ? "–"
                                : day.workedMinutes > 0
                                  ? hm(day.workedMinutes)
                                  : day.plannedMinutes > 0
                                    ? "–"
                                    : t("free")}
                            </span>
                            <span
                              className={`db-mt-sub text-[11.5px] ${state.incomplete && !state.running ? "text-[#9a5b00]" : state.running ? "text-[#357a52]" : diff >= 0 ? "text-[#357a52]" : "text-[#b4332a]"}`}
                            >
                              {state.incomplete && !state.running
                                ? t("missing")
                                : state.running
                                  ? t("running")
                                  : day.workedMinutes > 0 && day.plannedMinutes > 0
                                    ? `${diff >= 0 ? "+" : ""}${hm(diff)}`
                                    : " "}
                            </span>
                          </span>
                        )}
                        <span className="flex flex-col items-center font-mono text-[10px] leading-tight text-[#6e6e6b] uppercase">
                          <span>{isMonth ? Number(day.date.slice(8)) : weekday.format(asDate(day.date)).replace(".", "")}</span>
                          {!isMonth && <span className="text-[#9a9a96] normal-case">{dateLabel.format(asDate(day.date))}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#ecebe7] pt-4 text-[12.5px] text-[#6e6e6b]">
              <span className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px] bg-[#8b6ed4]" />
                  {t("legendWorked")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px] bg-[#f6f5f2] shadow-[inset_0_0_0_1px_#d9d8d3]" />
                  {t("legendPlanned")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px] bg-[repeating-linear-gradient(135deg,rgba(224,123,0,0.7)_0_2px,transparent_2px_4px)]" />
                  {t("legendIncomplete")}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-4">
                <span>
                  {t("breakTotal")} <strong className="font-semibold text-ink">{t("minutes", { count: totals.breaks })}</strong>
                </span>
                <span>
                  {t("total")} <strong className="font-semibold text-ink">{hm(totals.worked)}</strong>
                </span>
                {totals.planned > 0 && (
                  <strong className={`font-semibold ${totals.worked - totals.planned >= 0 ? "text-[#357a52]" : "text-[#b4332a]"}`}>
                    {totals.worked - totals.planned >= 0 ? "+" : ""}
                    {hm(totals.worked - totals.planned)}
                  </strong>
                )}
              </span>
            </div>
          </div>

          {selectedDay && (
            <aside className="rounded-[14px] border border-[#ecebe7] bg-[#fafaf8] p-5">
              <span className="font-mono text-[10px] tracking-[0.12em] text-[#6e6e6b] uppercase">{t("correction")}</span>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-[18px] font-semibold tracking-[-0.4px]">
                  {longDate.format(asDate(selectedDay.date))}
                </span>
                {selectedState?.missingOut && (
                  <span className="rounded-[7px] bg-[#fff1d6] px-2 py-[3px] text-[12px] font-medium text-[#9a5b00] shadow-[inset_0_0_0_1px_rgba(224,123,0,0.3)]">
                    {t("missingClockOut")}
                  </span>
                )}
                {selectedState?.missingDay && (
                  <span className="rounded-[7px] bg-[#fff1d6] px-2 py-[3px] text-[12px] font-medium text-[#9a5b00] shadow-[inset_0_0_0_1px_rgba(224,123,0,0.3)]">
                    {t("noEntry")}
                  </span>
                )}
              </div>
              <p className="mt-1 mb-4 text-[13px] text-[#6e6e6b]">
                {selectedDay.entries.length > 0
                  ? t("recorded", {
                      times: selectedDay.entries
                        .map((entry) => `${entry.clockInTime} – ${entry.isOpen || entry.autoClosed ? t("missingShort") : entry.clockOutTime}`)
                        .join(", "),
                    })
                  : selectedDay.shiftStart
                    ? t("plannedShift", { start: selectedDay.shiftStart, end: selectedDay.shiftEnd ?? "" })
                    : t("nothingRecorded")}
              </p>
              {pendingDates.has(selectedDay.date) ? (
                <p className="m-0 rounded-[10px] bg-[rgba(139,110,212,0.08)] px-3 py-2.5 text-[13px] text-[#4f3a9c]">
                  {t("alreadyRequested")}
                </p>
              ) : (
                <TimeCorrectionForm
                  key={`${selectedDay.date}-${formKey}`}
                  tenant={tenant}
                  defaults={{
                    date: selectedDay.date,
                    startTime: firstEntry?.clockInTime ?? selectedDay.shiftStart ?? "",
                    endTime:
                      (lastEntry && !lastEntry.isOpen && !lastEntry.autoClosed ? lastEntry.clockOutTime : null) ??
                      selectedDay.shiftEnd ??
                      "",
                  }}
                  onDone={() => setFormKey((key) => key + 1)}
                />
              )}
            </aside>
          )}
        </div>
      </section>

      {corrections.length > 0 && (
        <section className="db-card rounded-[16px] border border-[#ecebe7] bg-white p-6">
          <h2 className="m-0 mb-3 font-display text-[19px] font-semibold tracking-[-0.4px]">{t("myCorrections")}</h2>
          <div className="flex flex-col">
            {corrections.slice(0, 8).map((item, index) => (
              <div key={item.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${index ? "border-t border-[#ecebe7]" : ""}`}>
                <span className="flex flex-col">
                  <span className="text-[14px] font-semibold">
                    {longDate.format(asDate(item.date))} · {item.requestedStartTime} – {item.requestedEndTime}
                  </span>
                  {item.decisionNote && <span className="text-[12.5px] text-[#6e6e6b]">{item.decisionNote}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="rounded-[7px] bg-[#f2f1ed] px-2 py-[3px] text-[12px] font-medium text-[#6e6e6b]">
                    {t(`status.${item.status}`)}
                  </span>
                  {item.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => withdraw(item.id)}
                      className="db-act db-focus min-h-8 cursor-pointer rounded-[8px] border border-[#ecebe7] bg-[#f2f1ed] px-2.5 text-[12.5px] font-medium"
                    >
                      {t("withdraw")}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
