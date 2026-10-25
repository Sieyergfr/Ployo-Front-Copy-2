"use client";

import {
  approveVacationRequestAction,
  rejectVacationRequestAction,
} from "@/app/(dashboard)/u/[tenant]/urlaub/actions";
import { VacationDrawerButton } from "@/components/ActionDrawers";
import { useActionStateWithToast } from "@/components/Toasts";
import type { ActionState } from "@/lib/action-state";
import type { VacationRequest } from "@/lib/vacations";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";

export type VacationRow = VacationRequest & {
  hints: Array<{ text: string; tone: "ok" | "warning" | "danger" | "info" }>;
};

const hintColors = { ok: "#357a52", warning: "#9a5b00", danger: "#b4332a", info: "#2a6fdb" } as const;
const statusStyles = {
  pending: { color: "#9a5b00", bg: "rgba(224,123,0,0.10)", dot: "#e07b00" },
  approved: { color: "#1f5d2c", bg: "rgba(53,122,82,0.10)", dot: "#357a52" },
  rejected: { color: "#b4332a", bg: "rgba(180,51,42,0.08)", dot: "#b4332a" },
} as const;
const avatarColors = ["#2a5bc9", "#4a5568", "#1d8a65", "#c9622a", "#7a3c9c", "#b7791f", "#168a8a", "#c23b7a"];

function colorFor(name: string) {
  let hash = 0;

  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;

  return avatarColors[hash % avatarColors.length];
}

function DecisionButton({
  tenant,
  requestId,
  action,
  className,
  children,
}: {
  tenant: string;
  requestId: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  className: string;
  children: ReactNode;
}) {
  const [, formAction, isPending] = useActionStateWithToast(action);

  return (
    <form action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="requestId" value={requestId} />
      <button type="submit" disabled={isPending} className={className}>
        {children}
      </button>
    </form>
  );
}

type Filter = "all" | VacationRequest["status"];

export default function VacationRequestsTable({
  tenant,
  rows,
  canManage,
  canDelete,
}: {
  tenant: string;
  rows: VacationRow[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("VacationUi");
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const dateTime = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const counts = {
    all: rows.length,
    pending: rows.filter((row) => row.status === "pending").length,
    approved: rows.filter((row) => row.status === "approved").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
  };
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter(
      (row) =>
        (filter === "all" || row.status === filter) &&
        (!needle ||
          [row.name, row.location, row.team, row.note, row.startDate, row.endDate]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(needle)),
    );
  }, [rows, filter, query]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3">
        <div role="tablist" className="inline-flex gap-0.5 rounded-[10px] bg-[#f2f1ed] p-1">
          {(["all", "pending", "approved", "rejected"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
              className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-semibold ${filter === id ? "bg-white text-ink shadow-[0_1px_2px_rgba(14,14,14,0.08)]" : "text-[#6e6e6b]"}`}
            >
              {t(`filters.${id}`)}
              <span className="text-[11.5px] font-normal text-[#9a9a96]">{counts[id]}</span>
            </button>
          ))}
        </div>
        <label className="relative w-[240px]">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#8f8f8a]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="db-input box-border h-10 w-full rounded-[10px] border border-[#e4e3df] bg-white pr-3 pl-9 text-[13.5px]"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left">
          <thead>
            <tr className="border-t border-[#ecebe7] font-mono text-[10px] tracking-[0.1em] text-[#6e6e6b] uppercase">
              {["employee", "period", "days", "note", "status"].map((column) => (
                <th key={column} className="px-4 py-3 font-normal">
                  {t(`columns.${column}`)}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const style = statusStyles[row.status];
              const requestId = row.dbId ?? "";

              return (
                <tr key={row.dbId ?? row.id} className="border-t border-[#f0efeb] align-middle">
                  <td className="px-4 py-3.5">
                    <span className="flex items-center gap-3">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                        style={{ background: colorFor(row.name) }}
                      >
                        {row.initials}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[14.5px] font-semibold">{row.name}</span>
                        <span className="max-w-[200px] truncate text-[12.5px] text-[#6e6e6b]">
                          {[row.location, row.team].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="flex flex-col gap-0.5">
                      <span className="font-mono text-[13.5px] whitespace-nowrap">
                        {row.startDate} – {row.endDate}
                      </span>
                      {row.hints.map((hint) => (
                        <span key={hint.text} className="flex max-w-[210px] items-start gap-1.5 text-[12px]" style={{ color: hintColors[hint.tone] }}>
                          <span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-current" />
                          {hint.text}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[14px] font-semibold whitespace-nowrap">{row.days}</td>
                  <td className="max-w-[150px] truncate px-4 py-3.5 text-[13.5px] text-[#3d3d3a]">{row.note || "–"}</td>
                  <td className="px-4 py-3.5">
                    <span className="flex flex-col gap-1">
                      <span
                        className="inline-flex w-fit items-center gap-1.5 rounded-[7px] px-2 py-[3px] text-[12px] font-medium"
                        style={{ color: style.color, background: style.bg }}
                      >
                        <span className="size-1.5 rounded-full" style={{ background: style.dot }} />
                        {t(`status.${row.status}`)}
                      </span>
                      <span className="max-w-[180px] text-[11.5px] text-[#9a9a96]">
                        {row.status === "pending"
                          ? row.createdAt
                            ? t("requestedOn", { date: dateTime.format(new Date(row.createdAt)) })
                            : ""
                          : row.decidedAt
                            ? t(row.status === "approved" ? "approvedBy" : "rejectedBy", {
                                name: row.decidedByName || row.decidedBy || "–",
                                date: dateTime.format(new Date(row.decidedAt)),
                              })
                            : ""}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="flex flex-col items-stretch justify-end gap-1.5 xl:flex-row xl:items-center">
                      {row.status === "pending" && canManage && requestId && (
                        <>
                          <DecisionButton
                            tenant={tenant}
                            requestId={requestId}
                            action={approveVacationRequestAction}
                            className="db-approve db-focus min-h-9 cursor-pointer rounded-[9px] border border-ink bg-ink px-3 text-[13px] font-semibold text-white disabled:opacity-60"
                          >
                            {t("approve")}
                          </DecisionButton>
                          <DecisionButton
                            tenant={tenant}
                            requestId={requestId}
                            action={rejectVacationRequestAction}
                            className="db-act db-focus min-h-9 cursor-pointer rounded-[9px] border border-[#ecebe7] bg-[#f2f1ed] px-3 text-[13px] font-semibold disabled:opacity-60"
                          >
                            {t("reject")}
                          </DecisionButton>
                        </>
                      )}
                      <VacationDrawerButton tenant={tenant} request={row} canManage={canManage} canDelete={canDelete} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className="px-5 py-10 text-center text-[13px] text-[#6e6e6b]">{t("empty")}</p>}
      </div>
    </>
  );
}
