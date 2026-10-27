"use client";

import { exportAuditLogAction } from "@/app/(dashboard)/u/[tenant]/audit/actions";
import { dbInputClass } from "@/components/dashboard/DbDrawer";
import { DbCard, secondaryClass } from "@/components/dashboard/ui";
import { useToast } from "@/components/Toasts";
import { auditKinds, classifyAuditEntry, isSensitiveAuditEntry, type AuditKind } from "@/lib/audit-kinds";
import type { TenantAuditEntry } from "@/lib/audit";
import { ChevronDown, Download, Eye, Info, KeyRound, LogIn, Loader2, PenLine, Plus, Search, Trash2, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useMemo, useState, useSyncExternalStore } from "react";

const KIND_STYLE: Record<AuditKind, { icon: LucideIcon; tone: string; pill: string }> = {
  created: { icon: Plus, tone: "bg-[rgba(47,122,74,0.10)] text-[#2f7a4a]", pill: "bg-[rgba(47,122,74,0.10)] text-[#1f5d2c]" },
  changed: { icon: PenLine, tone: "bg-[rgba(44,100,201,0.10)] text-[#2c64c9]", pill: "bg-[rgba(44,100,201,0.10)] text-[#2c64c9]" },
  deleted: { icon: Trash2, tone: "bg-[rgba(180,51,42,0.10)] text-[#b4332a]", pill: "bg-[rgba(180,51,42,0.10)] text-[#b4332a]" },
  access: { icon: Eye, tone: "bg-[rgba(224,123,0,0.12)] text-[#c2571f]", pill: "bg-[rgba(224,123,0,0.12)] text-[#8a5300]" },
  export: { icon: Download, tone: "bg-[rgba(139,111,224,0.12)] text-[#6b4fc4]", pill: "bg-[rgba(139,111,224,0.12)] text-[#6b4fc4]" },
  rights: { icon: KeyRound, tone: "bg-[rgba(139,111,224,0.12)] text-[#6b4fc4]", pill: "bg-[rgba(139,111,224,0.12)] text-[#6b4fc4]" },
  login: { icon: LogIn, tone: "bg-[#f2f1ed] text-[#3d3d3a]", pill: "bg-[#f2f1ed] text-[#3d3d3a]" },
};

const noopSubscribe = () => () => {};

function dayKey(iso: string) {
  const date = new Date(iso);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function AuditLogClient({
  tenant,
  range,
  sinceDays,
  entries,
  truncated,
  retentionMonths,
}: {
  tenant: string;
  range: "today" | "7" | "30" | "all";
  sinceDays: number | null;
  entries: TenantAuditEntry[];
  truncated: boolean;
  retentionMonths: number;
}) {
  const t = useTranslations("AuditLogPage");
  const locale = useLocale();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [kind, setKind] = useState<AuditKind | "">("");
  const [actor, setActor] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const slot = useSyncExternalStore(noopSubscribe, () => document.getElementById("audit-actions"), () => null);

  const classified = useMemo(() => entries.map((entry) => ({ ...entry, kind: classifyAuditEntry(entry) })), [entries]);
  const areas = useMemo(() => [...new Set(classified.map((entry) => entry.source))].sort((a, b) => a.localeCompare(b, locale)), [classified, locale]);
  const actors = useMemo(() => [...new Set(classified.map((entry) => entry.actor))].sort((a, b) => a.localeCompare(b, locale)), [classified, locale]);
  const needle = query.trim().toLocaleLowerCase(locale);
  const visible = classified.filter(
    (entry) =>
      (!area || entry.source === area) &&
      (!kind || entry.kind === kind) &&
      (!actor || entry.actor === actor) &&
      (!needle || `${entry.actor} ${entry.action} ${entry.source} ${entry.detail}`.toLocaleLowerCase(locale).includes(needle)),
  );
  const groups = visible.reduce<Array<{ day: string; items: typeof visible }>>((list, entry) => {
    const key = dayKey(entry.createdAt);
    const last = list.at(-1);

    if (last && last.day === key) last.items.push(entry);
    else list.push({ day: key, items: [entry] });

    return list;
  }, []);
  const [now] = useState(() => Date.now());
  const today = dayKey(new Date(now).toISOString());
  const yesterday = dayKey(new Date(now - 86_400_000).toISOString());
  const dayLabel = (key: string) =>
    key === today
      ? t("today")
      : key === yesterday
        ? t("yesterday")
        : new Date(`${key}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const kpis = [
    { label: t("kpiEntries"), value: classified.length, caption: t("kpiEntriesCaption") },
    { label: t("kpiChanges"), value: classified.filter((entry) => ["created", "changed", "deleted"].includes(entry.kind)).length, caption: t("kpiChangesCaption") },
    { label: t("kpiSensitive"), value: classified.filter((entry) => entry.kind === "access" || isSensitiveAuditEntry(entry)).length, caption: t("kpiSensitiveCaption") },
    { label: t("kpiExports"), value: classified.filter((entry) => entry.kind === "export").length, caption: t("kpiExportsCaption") },
  ];
  const select = `${dbInputClass} !w-auto min-w-[160px] cursor-pointer bg-white`;

  async function exportCsv() {
    setExporting(true);
    const result = await exportAuditLogAction({ tenant, sinceDays });
    setExporting(false);

    if (result.error || !result.file) {
      toast({ tone: "error", title: result.error ?? t("exportFailed") });
      return;
    }

    const bytes = Uint8Array.from(atob(result.file.base64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: result.file.contentType }));
    const link = document.createElement("a");

    link.href = url;
    link.download = result.file.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      {slot &&
        createPortal(
          <button type="button" className={secondaryClass} onClick={exportCsv} disabled={exporting || entries.length === 0}>
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {t("export")}
          </button>,
          slot,
        )}

      <section className="mb-4 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        {kpis.map((kpi) => (
          <DbCard key={kpi.label} className="db-insight flex flex-col gap-1.5 p-[16px]">
            <span className="text-[13px] font-medium text-[#6e6e6b]">{kpi.label}</span>
            <span className="font-display text-[28px] leading-none font-semibold tracking-[-1px]">{kpi.value}</span>
            <span className="text-[12.5px] text-[#6e6e6b]">{kpi.caption}</span>
          </DbCard>
        ))}
      </section>

      <DbCard className="p-[18px]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9a9a96]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} className={`${dbInputClass} bg-white pl-9`} />
          </label>
          <select value={area} onChange={(event) => setArea(event.target.value)} aria-label={t("area")} className={select}>
            <option value="">{t("allAreas")}</option>
            {areas.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={kind} onChange={(event) => setKind(event.target.value as AuditKind | "")} aria-label={t("kind")} className={select}>
            <option value="">{t("allKinds")}</option>
            {auditKinds.map((item) => (
              <option key={item} value={item}>
                {t(`kindLabel.${item}`)}
              </option>
            ))}
          </select>
          <select value={actor} onChange={(event) => setActor(event.target.value)} aria-label={t("person")} className={select}>
            <option value="">{t("allPersons")}</option>
            {actors.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <span role="group" aria-label={t("range")} className="flex gap-0.5 rounded-[10px] bg-[#f2f1ed] p-[3px]">
            {(["today", "7", "30", "all"] as const).map((item) => (
              <Link
                key={item}
                href={`/u/${tenant}/audit${item === "30" ? "" : `?zeitraum=${item}`}`}
                aria-current={range === item ? "true" : undefined}
                className={`flex min-h-9 items-center rounded-[8px] px-3 text-[13px] no-underline ${
                  range === item ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "font-medium text-[#6e6e6b]"
                }`}
              >
                {t(`rangeLabel.${item}`)}
              </Link>
            ))}
          </span>
        </div>

        {groups.length === 0 && <p className="m-0 py-10 text-center text-[13.5px] text-[#6e6e6b]">{t("empty")}</p>}

        {groups.map((group) => (
          <div key={group.day}>
            <div className="mt-3 mb-1 px-1 font-mono text-[10px] tracking-[0.12em] text-[#9a9a96] uppercase">{dayLabel(group.day)}</div>
            <ul className="m-0 list-none p-0">
              {group.items.map((entry) => {
                const style = KIND_STYLE[entry.kind];
                const Icon = style.icon;
                const isOpen = open === entry.id;

                return (
                  <li key={entry.id} className="border-b border-[#f0efeb] last:border-b-0">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : entry.id)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-[8px] border-0 bg-transparent px-1 py-2.5 text-left text-ink hover:bg-[#fafaf8]"
                    >
                      <span className="w-11 shrink-0 font-mono text-[12px] text-[#9a9a96]">
                        {new Date(entry.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className={`flex size-7 shrink-0 items-center justify-center rounded-[8px] ${style.tone}`}>
                        <Icon size={14} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[14px]">
                          <span className="font-semibold">{entry.actor || t("system")}</span> · {entry.action}
                        </span>
                        <span className="truncate text-[12.5px] text-[#6e6e6b]">
                          {entry.source}
                          {entry.detail ? ` · ${entry.detail}` : ""}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-[6px] px-1.5 py-[2px] text-[12px] font-semibold ${style.pill}`}>{t(`kindLabel.${entry.kind}`)}</span>
                      <ChevronDown size={16} className={`shrink-0 text-[#9a9a96] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <dl className="m-0 mb-2 ml-[88px] grid gap-x-6 gap-y-1 rounded-[10px] bg-[#fafaf8] px-3.5 py-2.5 text-[12.5px] sm:grid-cols-[auto_1fr]">
                        <dt className="text-[#6e6e6b]">{t("detailTime")}</dt>
                        <dd className="m-0">{new Date(entry.createdAt).toLocaleString(locale)}</dd>
                        <dt className="text-[#6e6e6b]">{t("detailObject")}</dt>
                        <dd className="m-0 font-mono">
                          {entry.entityType} · {entry.entityId}
                        </dd>
                        {entry.detail && (
                          <>
                            <dt className="text-[#6e6e6b]">{t("detailDetail")}</dt>
                            <dd className="m-0 whitespace-pre-wrap">{entry.detail}</dd>
                          </>
                        )}
                        {entry.ipAddress && (
                          <>
                            <dt className="text-[#6e6e6b]">{t("detailIp")}</dt>
                            <dd className="m-0 font-mono">{entry.ipAddress}</dd>
                          </>
                        )}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <p className="m-0 mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#f0efeb] pt-3 text-[12.5px] text-[#6e6e6b]">
          <Info size={14} />
          {t("footer", { months: retentionMonths })}
          {truncated && ` ${t("truncated")}`}{" "}
          <Link href={`/u/${tenant}/einstellungen?kat=security`} className="font-semibold text-[#6b4fc4]">
            {t("changeRetention")}
          </Link>
        </p>
      </DbCard>
    </>
  );
}
