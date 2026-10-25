import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

export type TimelineAbsence = {
  id: string;
  employeeId: string;
  from: string;
  to: string;
  pending: boolean;
  tooltip: string;
};

export type TimelineEmployee = { id: string; name: string; initials: string; team: string };

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

const avatarColors = ["#2a5bc9", "#4a5568", "#1d8a65", "#c9622a", "#7a3c9c", "#b7791f", "#168a8a", "#c23b7a"];

function colorFor(name: string) {
  let hash = 0;

  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;

  return avatarColors[hash % avatarColors.length];
}

/**
 * "Wer ist wann weg?": Monatsleiste je Person mit genehmigtem (Balken) und
 * beantragtem Urlaub (schraffiert). Darüber die Tage, an denen mehrere aus
 * einem Team gleichzeitig fehlen.
 */
export default function VacationTimeline({
  month,
  locale,
  absences,
  employees,
  holidays,
  labels,
  hrefFor,
}: {
  month: string;
  locale: string;
  absences: TimelineAbsence[];
  employees: TimelineEmployee[];
  holidays: Map<string, string>;
  labels: {
    title: string;
    subtitle: string;
    concurrent: string;
    approved: string;
    requested: string;
    multipleTeam: string;
    holiday: string;
    previous: string;
    next: string;
    empty: string;
  };
  hrefFor: (month: string) => string;
}) {
  const start = `${month}-01`;
  const first = new Date(`${start}T12:00:00Z`);
  const dayCount = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const end = addDays(start, dayCount - 1);
  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(start, index);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

    return { date, day: index + 1, weekend: weekday === 0 || weekday === 6, weekday };
  });
  const weekdayLetter = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
  const shortDate = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const inMonth = absences.filter((absence) => absence.from <= end && absence.to >= start);
  const teamOf = new Map(employees.map((employee) => [employee.id, employee.team]));
  const rows = employees
    .filter((employee) => inMonth.some((absence) => absence.employeeId === employee.id))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  // Tage, an denen mindestens zwei Personen desselben Teams fehlen (mit der höchsten Zahl).
  const concurrent = days.map((day) => {
    const perTeam = new Map<string, Set<string>>();

    for (const absence of inMonth) {
      if (absence.from > day.date || absence.to < day.date) continue;

      const team = teamOf.get(absence.employeeId);

      if (!team) continue;

      const set = perTeam.get(team) ?? new Set<string>();

      set.add(absence.employeeId);
      perTeam.set(team, set);
    }

    return Math.max(0, ...[...perTeam.values()].map((set) => set.size));
  });
  const previousMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const nextMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
  const grid = { gridTemplateColumns: `170px repeat(${dayCount}, minmax(22px, 1fr))` };

  return (
    <section className="db-card mb-5 rounded-[16px] border border-[#ecebe7] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="m-0 font-display text-[19px] font-semibold tracking-[-0.4px]">{labels.title}</h2>
          <span className="text-[13px] text-[#6e6e6b]">{labels.subtitle}</span>
        </span>
        <span className="flex items-center gap-2">
          <Link
            href={hrefFor(previousMonth)}
            aria-label={labels.previous}
            className="db-btn2 flex size-9 items-center justify-center rounded-[9px] border border-[#ecebe7] bg-[#f2f1ed] text-ink"
          >
            <ChevronLeft size={15} />
          </Link>
          <span className="min-w-[130px] text-center font-display text-[15px] font-semibold">
            {new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(first)}
          </span>
          <Link
            href={hrefFor(nextMonth)}
            aria-label={labels.next}
            className="db-btn2 flex size-9 items-center justify-center rounded-[9px] border border-[#ecebe7] bg-[#f2f1ed] text-ink"
          >
            <ChevronRight size={15} />
          </Link>
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[880px]">
          <div className="grid items-end gap-y-1" style={grid}>
            <span />
            {days.map((day) => (
              <span
                key={day.date}
                title={holidays.get(day.date)}
                className={`mx-px flex flex-col items-center rounded-[6px] py-1 text-[10.5px] ${day.weekend ? "bg-[#f2f1ed] text-[#9a9a96]" : "text-[#6e6e6b]"}`}
              >
                <span className="font-mono text-[9px] uppercase">{weekdayLetter.format(new Date(`${day.date}T12:00:00Z`))}</span>
                <span className={`font-semibold ${holidays.has(day.date) ? "text-[#b4332a]" : "text-ink"}`}>{day.day}</span>
              </span>
            ))}
            <span className="font-mono text-[9.5px] tracking-[0.1em] text-[#9a9a96] uppercase">{labels.concurrent}</span>
            {concurrent.map((count, index) => (
              <span key={index} className="flex h-5 items-center justify-center">
                {count >= 2 && (
                  <span className="flex size-[17px] items-center justify-center rounded-full bg-[#e07b00] text-[10px] font-bold text-white">
                    {count}
                  </span>
                )}
              </span>
            ))}
          </div>

          {rows.length === 0 && <p className="m-0 py-6 text-center text-[13px] text-[#6e6e6b]">{labels.empty}</p>}

          {rows.map((employee) => (
            <div key={employee.id} className="grid items-center border-t border-[#f5f4f1] py-1.5" style={grid}>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="flex size-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: colorFor(employee.name) }}
                >
                  {employee.initials}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-semibold">{employee.name}</span>
                  <span className="truncate text-[11.5px] text-[#9a9a96]">{employee.team}</span>
                </span>
              </span>
              {inMonth
                .filter((absence) => absence.employeeId === employee.id)
                .map((absence) => {
                  const from = absence.from < start ? start : absence.from;
                  const to = absence.to > end ? end : absence.to;
                  const startColumn = Number(from.slice(8)) + 1;
                  const endColumn = Number(to.slice(8)) + 2;
                  const span = endColumn - startColumn;

                  return (
                    <span
                      key={absence.id}
                      title={absence.tooltip}
                      className={`mx-px flex h-[26px] items-center overflow-hidden rounded-[7px] px-2 text-[11px] font-semibold whitespace-nowrap ${
                        absence.pending ? "text-[#7a4e00] shadow-[inset_0_0_0_1.5px_rgba(224,123,0,0.55)]" : "bg-[#168a8a] text-white shadow-[0_6px_14px_-8px_rgba(22,138,138,0.9)]"
                      }`}
                      style={{
                        gridRow: 1,
                        gridColumn: `${startColumn} / ${endColumn}`,
                        backgroundImage: absence.pending
                          ? "repeating-linear-gradient(135deg, rgba(224,123,0,0.25) 0 4px, rgba(255,247,234,0.95) 4px 9px)"
                          : undefined,
                      }}
                    >
                      {span >= 4 ? `${shortDate.format(new Date(`${absence.from}T12:00:00Z`))}–${shortDate.format(new Date(`${absence.to}T12:00:00Z`))}` : ""}
                    </span>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-[#6e6e6b]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-[3px] bg-[#168a8a]" />
          {labels.approved}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-[3px] bg-[repeating-linear-gradient(135deg,rgba(224,123,0,0.7)_0_2px,transparent_2px_4px)] shadow-[inset_0_0_0_1px_rgba(224,123,0,0.55)]" />
          {labels.requested}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="flex size-[15px] items-center justify-center rounded-full bg-[#e07b00] text-[9px] font-bold text-white">2</span>
          {labels.multipleTeam}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-[#b4332a]" />
          {labels.holiday}
        </span>
      </div>
    </section>
  );
}
