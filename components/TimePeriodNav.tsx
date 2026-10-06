import type { TimePeriod } from "@/lib/time-tracking";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

/** Woche/Monat umschalten und blättern — Zustand liegt komplett in der URL. */
export default async function TimePeriodNav({
  basePath,
  period,
  range,
  today,
  extraParams = {},
}: {
  basePath: string;
  period: TimePeriod;
  range: { from: string; to: string; previous: string | null; next: string | null };
  today: string;
  extraParams?: Record<string, string>;
}) {
  const t = await getTranslations("TimeTracking");
  const locale = await getLocale();
  const href = (nextPeriod: TimePeriod, date: string) =>
    `${basePath}?${new URLSearchParams({ ...extraParams, period: nextPeriod, date }).toString()}`;
  const format = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: "UTC" });
  const label =
    period === "month"
      ? format(range.from, { month: "long", year: "numeric" })
      : `${format(range.from, { day: "2-digit", month: "2-digit" })} – ${format(range.to, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })}`;
  const segment = (value: TimePeriod, text: string) => (
    <Link
      href={href(value, range.from)}
      className={`rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold ${
        period === value ? "bg-white text-ink shadow-sm" : "text-muted-2"
      }`}
    >
      {text}
    </Link>
  );

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Link
          href={href(period, range.previous ?? range.from)}
          className="btn btn-secondary btn-sm"
          aria-label={t("previous")}
        >
          <ChevronLeft size={15} />
        </Link>
        <span className="min-w-[180px] text-center text-[14px] font-semibold text-ink">{label}</span>
        <Link
          href={href(period, range.next ?? range.to)}
          className="btn btn-secondary btn-sm"
          aria-label={t("next")}
        >
          <ChevronRight size={15} />
        </Link>
        <Link href={href(period, today)} className="btn btn-secondary btn-sm">
          {t("today")}
        </Link>
      </div>
      <div className="flex gap-1 rounded-xl border border-border bg-bg p-1">
        {segment("week", t("periodWeek"))}
        {segment("month", t("periodMonth"))}
      </div>
    </div>
  );
}
