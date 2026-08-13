import type { MyWeekDay } from "@/lib/shift-service";
import { Clock } from "lucide-react";

export default function MyShiftsCard({
  label,
  range,
  days,
}: {
  label: string;
  range: string;
  days: MyWeekDay[];
}) {
  return (
    <section className="rounded-card border border-border bg-white px-6 py-[22px]">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
          <Clock size={17} />
          Meine Schichten
        </h2>
        <span className="font-mono text-[11px] text-muted">
          {label} · {range}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => (
          <div
            key={day.id}
            className={`rounded-xl border px-2.5 py-2.5 ${
              day.isWeekend ? "border-border-soft bg-bg" : "border-border-soft bg-white"
            }`}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-muted">
              {day.weekday} · {day.date}
            </div>
            {day.shifts.length === 0 ? (
              <div className="mt-1.5 text-[12px] text-muted">—</div>
            ) : (
              <div className="mt-1.5 flex flex-col gap-1.5">
                {day.shifts.map((shift) => (
                  <div key={shift.id}>
                    <div className="text-[12.5px] font-semibold text-ink">{shift.time}</div>
                    {shift.location && (
                      <div className="truncate text-[11px] text-muted">{shift.location}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
