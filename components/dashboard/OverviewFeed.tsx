"use client";

import {
  decideVacationRequestAction,
  decideWishFreeRequestAction,
} from "@/app/(dashboard)/u/[tenant]/overview-actions";
import { useActionStateWithToast } from "@/components/Toasts";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  Clock,
  FileWarning,
  Star,
  TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

export type OverviewFeedCategory = "critical" | "requests" | "deadlines" | "times";

export type OverviewFeedItem = {
  id: string;
  category: OverviewFeedCategory;
  severity: "critical" | "warning" | "request" | "info";
  icon: "alert" | "request" | "document" | "time";
  title: string;
  text: string;
  hint?: { text: string; tone: "ok" | "warning" | "info" };
  when: string;
  action?: { label: string; href: string };
  request?: { kind: "vacation" | "wishFree"; requestId: string };
};

const severityStyles = {
  critical: { dot: "#b4332a", tag: "#b4332a", tile: "rgba(180,51,42,0.08)", ring: "rgba(180,51,42,0.2)", icon: "#b4332a" },
  warning: { dot: "#e07b00", tag: "#7a4e00", tile: "rgba(224,123,0,0.10)", ring: "rgba(224,123,0,0.25)", icon: "#e07b00" },
  request: { dot: "#7a3c9c", tag: "#7a3c9c", tile: "rgba(139,110,212,0.12)", ring: "rgba(139,110,212,0.25)", icon: "#7a3c9c" },
  info: { dot: "#2a6fdb", tag: "#2a6fdb", tile: "rgba(42,111,219,0.08)", ring: "rgba(42,111,219,0.2)", icon: "#2a6fdb" },
} as const;

const hintColors = { ok: "#357a52", warning: "#7a4e00", info: "#2a6fdb" } as const;

const icons = {
  alert: TriangleAlert,
  request: CalendarCheck,
  document: FileWarning,
  time: Clock,
} as const;

function DecisionForms({
  tenant,
  request,
  onDone,
}: {
  tenant: string;
  request: NonNullable<OverviewFeedItem["request"]>;
  onDone: (decision: "approved" | "rejected") => void;
}) {
  const t = useTranslations("Overview.feed");
  const action =
    request.kind === "vacation" ? decideVacationRequestAction : decideWishFreeRequestAction;
  const [, formAction, isPending] = useActionStateWithToast(
    async (previous: Awaited<ReturnType<typeof action>>, formData: FormData) => {
      const result = await action(previous, formData);

      if (result.success) {
        onDone(formData.get("decision") === "approved" ? "approved" : "rejected");
      }

      return result;
    },
  );

  return (
    <form action={formAction} className="db-req-actions flex gap-2">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="requestId" value={request.requestId} />
      <button
        type="submit"
        name="decision"
        value="rejected"
        disabled={isPending}
        className="db-decline db-focus min-h-9 cursor-pointer rounded-[9px] border border-[rgba(180,51,42,0.25)] bg-white px-3 py-[7px] text-[13px] font-medium text-[#b4332a] disabled:opacity-60"
      >
        {t("decline")}
      </button>
      <button
        type="submit"
        name="decision"
        value="approved"
        disabled={isPending}
        className="db-approve db-focus inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-ink bg-ink px-3 py-[7px] text-[13px] font-medium text-white disabled:opacity-60"
      >
        <Check size={13} strokeWidth={2.6} />
        {t("approve")}
      </button>
    </form>
  );
}

export default function OverviewFeed({
  tenant,
  items,
}: {
  tenant: string;
  items: OverviewFeedItem[];
}) {
  const t = useTranslations("Overview.feed");
  const [filter, setFilter] = useState<OverviewFeedCategory | "all">("all");
  const [decisions, setDecisions] = useState<Record<string, "approved" | "rejected">>({});
  const isOpen = (item: OverviewFeedItem) => !decisions[item.id];
  const filters: Array<{ id: OverviewFeedCategory | "all"; label: string }> = [
    { id: "all", label: t("filters.all") },
    { id: "critical", label: t("filters.critical") },
    { id: "requests", label: t("filters.requests") },
    { id: "deadlines", label: t("filters.deadlines") },
    { id: "times", label: t("filters.times") },
  ];
  const visible = items.filter((item) => filter === "all" || item.category === filter);

  return (
    <>
      <div role="tablist" aria-label={t("filterLabel")} className="mb-3.5 flex flex-wrap gap-1.5">
        {filters.map((item) => {
          const selected = filter === item.id;
          const count = items.filter(
            (entry) => (item.id === "all" || entry.category === item.id) && isOpen(entry),
          ).length;

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={
                selected
                  ? "db-chip db-focus inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-full bg-ink px-3 py-[7px] text-[13px] font-medium text-white shadow-[0_6px_16px_-6px_rgba(139,110,212,0.7)]"
                  : "db-chip db-focus inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-full bg-[#f2f1ed] px-3 py-[7px] text-[13px] font-medium text-[#6e6e6b] shadow-[inset_0_0_0_1px_#ecebe7]"
              }
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span className="text-[11px] font-semibold opacity-75">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        {visible.map((item) => {
          const style = severityStyles[item.severity];
          const Icon = icons[item.icon];
          const decision = decisions[item.id];

          return (
            <div
              key={item.id}
              className="db-feed-item flex gap-3.5 rounded-[12px] border border-[#e4e3df] bg-[#fafaf8] p-3.5"
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
                style={{ background: style.tile, boxShadow: `inset 0 0 0 1px ${style.ring}` }}
              >
                <Icon size={16} color={style.icon} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <span className="text-[14px] font-semibold">{item.title}</span>
                  <span
                    className="inline-flex items-center gap-[5px] text-[11.5px] font-medium"
                    style={{ color: style.tag }}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: style.dot }} />
                    {t(`tags.${item.severity}`)}
                  </span>
                </div>
                <span className="text-[13px] leading-[1.5] text-[#6e6e6b]">{item.text}</span>
                {item.hint && (
                  <span
                    className="inline-flex items-center gap-1.5 text-[12px]"
                    style={{ color: hintColors[item.hint.tone] }}
                  >
                    <Star size={12} />
                    {item.hint.text}
                  </span>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {item.request && !decision && (
                    <DecisionForms
                      tenant={tenant}
                      request={item.request}
                      onDone={(value) =>
                        setDecisions((current) => ({ ...current, [item.id]: value }))
                      }
                    />
                  )}
                  {decision && (
                    <span
                      role="status"
                      className={
                        decision === "approved"
                          ? "inline-flex items-center gap-1.5 rounded-[7px] border border-[rgba(53,122,82,0.25)] bg-[rgba(53,122,82,0.10)] px-2 py-[3px] text-[12px] font-medium text-[#357a52]"
                          : "inline-flex items-center gap-1.5 rounded-[7px] border border-[rgba(180,51,42,0.25)] bg-[rgba(180,51,42,0.10)] px-2 py-[3px] text-[12px] font-medium text-[#b4332a]"
                      }
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      {decision === "approved" ? t("approved") : t("declined")}
                    </span>
                  )}
                  {item.action && (
                    <Link
                      href={item.action.href}
                      className="db-act db-focus inline-flex min-h-9 items-center gap-1.5 rounded-[9px] border border-[#ecebe7] bg-[#f2f1ed] px-3 py-[7px] text-[13px] font-medium text-ink no-underline"
                    >
                      {item.action.label}
                      <ArrowRight size={13} />
                    </Link>
                  )}
                </div>
              </div>
              <span className="pt-0.5 font-mono text-[10px] tracking-[0.03em] whitespace-nowrap text-[#6e6e6b] uppercase">
                {item.when}
              </span>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="px-4 py-8 text-center text-[12.5px] text-[#6e6e6b]">{t("empty")}</div>
        )}
      </div>
    </>
  );
}
