import { DbCard, avatarColor } from "@/components/dashboard/ui";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

/** Kleine, gemeinsame Bausteine der Report-Tabs (Server-tauglich). */

export function ReportKpi({
  label,
  value,
  unit,
  caption,
  tone = "",
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  caption?: ReactNode;
  tone?: string;
  hint?: string;
}) {
  return (
    <DbCard className="db-insight flex flex-col gap-1.5 p-[16px]">
      <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-[#6e6e6b]">
        {label}
        {hint && (
          <span title={hint} className="flex size-4 items-center justify-center rounded-full bg-[#f2f1ed] text-[#9a9a96]">
            <Info size={10} />
          </span>
        )}
      </span>
      <span className={`font-display text-[28px] leading-none font-semibold tracking-[-1px] ${tone}`}>
        {value}
        {unit && <span className="ml-1 font-sans text-[13px] font-normal tracking-normal text-[#9a9a96]">{unit}</span>}
      </span>
      {caption && <span className="text-[12.5px] text-[#6e6e6b]">{caption}</span>}
    </DbCard>
  );
}

export function ReportKpiRow({ children }: { children: ReactNode }) {
  return <section className="mb-4 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">{children}</section>;
}

export function ReportCardHead({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 font-display text-[17px] font-semibold tracking-[-0.3px]">{title}</h2>
        {subtitle && <span className="text-[13px] text-[#6e6e6b]">{subtitle}</span>}
      </div>
      {action}
    </div>
  );
}

export function PersonAvatar({ id, initials, size = 32 }: { id: string; initials: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ background: avatarColor(id), width: size, height: size, fontSize: size * 0.33 }}
    >
      {initials}
    </span>
  );
}

/** Einfaches Säulendiagramm: Wert über der Säule, Beschriftung darunter; die letzte Säule hervorgehoben. */
export function ColumnChart({
  items,
  height = 150,
  color,
  highlight,
  label,
}: {
  items: Array<{ key: string; label: string; value: number; display: string }>;
  height?: number;
  color: (value: number, index: number) => string;
  highlight?: (value: number, index: number) => string;
  label?: string;
}) {
  const max = Math.max(1, ...items.map((item) => Math.abs(item.value)));

  return (
    <div role="img" aria-label={label} className="flex items-end gap-2">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="text-[12px] font-semibold text-[#3d3d3a] tabular-nums">{item.display}</span>
            <div className="flex w-full justify-center border-b border-[#ecebe7]" style={{ height }}>
              <span
                className="mt-auto w-full max-w-[46px] rounded-t-[6px]"
                style={{
                  height: `${Math.max(item.value === 0 ? 0 : 3, (Math.abs(item.value) / max) * height)}px`,
                  background: isLast && highlight ? highlight(item.value, index) : color(item.value, index),
                }}
              />
            </div>
            <span className={`font-mono text-[10px] tracking-[0.08em] uppercase ${isLast ? "text-ink" : "text-[#9a9a96]"}`}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Pill({ tone, children }: { tone: "red" | "amber" | "green" | "blue" | "gray" | "purple"; children: ReactNode }) {
  const tones = {
    red: "bg-[rgba(180,51,42,0.10)] text-[#b4332a]",
    amber: "bg-[rgba(224,123,0,0.12)] text-[#8a5300]",
    green: "bg-[rgba(47,122,74,0.12)] text-[#1f5d2c]",
    blue: "bg-[rgba(44,100,201,0.10)] text-[#2c64c9]",
    gray: "bg-[#f2f1ed] text-[#6e6e6b]",
    purple: "bg-[rgba(107,79,196,0.10)] text-[#6b4fc4]",
  };

  return <span className={`inline-block rounded-[6px] px-1.5 py-[2px] text-[12px] font-semibold whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function formatNumber(value: number, locale: string, digits = 1) {
  return value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatSignedHours(minutes: number, locale: string, digits = 1) {
  const value = Math.round((minutes / 60) * 10 ** digits) / 10 ** digits;
  const text = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : `±${text}`;
}

export function signedTone(minutes: number) {
  return minutes >= 30 ? "text-[#1f5d2c]" : minutes <= -30 ? "text-[#b4332a]" : "text-[#6e6e6b]";
}
