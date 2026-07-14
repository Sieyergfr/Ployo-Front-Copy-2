import { SicknessReportButton } from "@/components/AbsenceActionButtons";
import { SicknessDrawerButton } from "@/components/ActionDrawers";
import PageHeader from "@/components/PageHeader";
import {
  currentSickness,
  sicknessChart,
  sicknessHistory,
  sicknessMetrics,
  type CurrentSickness,
  type SicknessHistoryItem,
  type SicknessMetric,
} from "@/lib/sickness";

export const metadata = {
  title: "Krankheit",
};

function SicknessMetricCard({ label, value, caption, tone }: SicknessMetric) {
  return (
    <div className="rounded-[14px] border border-border bg-white px-[22px] pt-5 pb-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted">
        {label}
      </div>
      <div
        className={`mt-4 mb-2 font-display text-[38px] font-semibold leading-none tracking-[-1.2px] ${
          tone === "danger" ? "text-danger" : "text-ink"
        }`}
      >
        {value}
      </div>
      <div className="text-[12px] text-muted">{caption}</div>
    </div>
  );
}

function CurrentSicknessRow({ item }: { item: CurrentSickness }) {
  return (
    <div className="flex items-center gap-3 border-t border-border-soft py-3.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted-2 text-[12px] font-semibold text-white">
        {item.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold text-ink">
          {item.name}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-muted">
          {item.location} {"·"} seit {item.since}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-[14px] font-semibold text-muted-2">
          {item.days}
        </div>
        <div className="text-[10px] text-muted">Tage</div>
      </div>
      <SicknessDrawerButton item={item} />
    </div>
  );
}

function SicknessHistoryRow({ item }: { item: SicknessHistoryItem }) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-border-soft px-6 py-3.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#B9B9B4] text-[12px] font-semibold text-white">
        {item.initials}
      </div>
      <div className="min-w-[120px] flex-1">
        <div className="text-[13.5px] font-semibold text-ink">{item.name}</div>
        <div className="mt-0.5 text-[12px] text-muted">{item.location}</div>
      </div>
      <div className="shrink-0 font-mono text-[12px] text-ink">
        {item.startDate} {"–"} {item.endDate}
      </div>
      <div className="shrink-0 font-mono text-[12px] text-muted">
        {item.days}
      </div>
      <SicknessDrawerButton item={item} />
      <span className="inline-flex shrink-0 rounded-[7px] bg-success/10 px-[9px] py-0.5 font-mono text-[10.5px] text-success">
        ✓ Genesen
      </span>
    </div>
  );
}

export default function SicknessPage() {
  return (
    <>
      <PageHeader eyebrow="Abwesenheitsstatistik" title="Krankheit">
        <SicknessReportButton />
      </PageHeader>

      <section className="mb-7 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {sicknessMetrics.map((metric) => (
          <SicknessMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="mb-3.5 grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <div className="overflow-hidden rounded-card border border-border bg-white">
          <div className="flex items-center justify-between gap-4 px-6 pt-[22px] pb-4">
            <div>
              <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.4px] text-ink">
                Aktuell krank
              </h2>
              <div className="mt-1 text-[12.5px] text-muted">
                Laufende Krankmeldungen
              </div>
            </div>
            <span className="shrink-0 font-mono text-[12px] font-medium text-muted-2">
              {currentSickness.length} MA
            </span>
          </div>
          <div className="px-6 pb-5">
            {currentSickness.map((item) => (
              <CurrentSicknessRow key={item.id} item={item} />
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-card border border-border bg-white">
          <div className="px-6 pt-[22px] pb-4">
            <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.4px] text-ink">
              Krankenquote
            </h2>
            <div className="mt-1 text-[12.5px] text-muted">
              Letzte 6 Monate
            </div>
          </div>
          <div className="px-6 pb-6">
            <div className="flex h-[110px] items-end gap-2.5">
              {sicknessChart.map((item) => (
                <div
                  key={item.month}
                  className="flex flex-1 flex-col items-center gap-[5px]"
                >
                  <div
                    className={`font-mono text-[10.5px] font-semibold ${
                      item.current ? "text-ink" : "text-muted"
                    }`}
                  >
                    {item.count}
                  </div>
                  <div
                    className={`w-full rounded-t ${item.current ? "bg-ink" : "bg-border"}`}
                    style={{ height: item.height }}
                  />
                  <div className="font-mono text-[9.5px] text-muted">
                    {item.month}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-card border border-border bg-white">
        <div className="border-b border-border px-6 pt-5 pb-3.5">
          <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.4px] text-ink">
            Verlauf · letzte 30 Tage
          </h2>
        </div>

        {sicknessHistory.map((item) => (
          <SicknessHistoryRow key={item.id} item={item} />
        ))}
      </section>
    </>
  );
}
