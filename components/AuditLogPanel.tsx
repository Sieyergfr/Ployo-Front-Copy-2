import type { AuditLogEntry } from "@/lib/audit";
import { ShieldCheck } from "lucide-react";

export default function AuditLogPanel({
  entries,
  title = "Audit Log",
}: {
  entries: AuditLogEntry[];
  title?: string;
}) {
  return (
    <section className="rounded-card border border-border bg-white px-6 py-[22px]">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-border-soft text-muted-2">
          <ShieldCheck size={17} />
        </span>
        <div>
          <h2 className="font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
            {title}
          </h2>
          <div className="mt-0.5 font-mono text-[10px] text-muted">
            Actor, Source, Zeitpunkt und Kontext
          </div>
        </div>
      </div>
      <div>
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="grid gap-3 border-t border-border-soft py-3 text-[12.5px] text-ink sm:grid-cols-[1.1fr_1fr_120px]"
          >
            <div className="min-w-0">
              <div className="truncate font-semibold">{entry.action}</div>
              <div className="mt-0.5 truncate text-muted">{entry.actor}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate font-mono text-[10.5px] text-muted-2">
                {entry.source}
              </div>
              {entry.detail && (
                <div className="mt-0.5 truncate text-muted">{entry.detail}</div>
              )}
            </div>
            <div className="font-mono text-[10.5px] text-muted">
              {entry.timestamp}
              {entry.ipAddress && (
                <div className="mt-0.5 text-[#B0B0AB]">{entry.ipAddress}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
