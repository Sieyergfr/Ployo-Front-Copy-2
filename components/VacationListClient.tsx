"use client";

import { useMemo, useState } from "react";
import {
  approveVacationRequestAction,
  rejectVacationRequestAction,
} from "@/app/(dashboard)/u/[tenant]/urlaub/actions";
import { VacationDrawerButton } from "@/components/ActionDrawers";
import FormSubmitButton from "@/components/FormSubmitButton";
import { ListSearchBox } from "@/components/ListSearchBox";
import PaginationControls from "@/components/PaginationControls";
import { useActionStateWithToast } from "@/components/Toasts";
import type { ActionState } from "@/lib/action-state";
import { getVacationStatusConfig, type VacationRequest } from "@/lib/vacations";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type T = ReturnType<typeof useTranslations>;
type StatusFilterValue = VacationRequest["status"] | "all";

function getStatusFilters(t: T): { label: string; value: StatusFilterValue }[] {
  return [
    { label: t("filterAll"), value: "all" },
    { label: t("filterPending"), value: "pending" },
    { label: t("filterApproved"), value: "approved" },
    { label: t("filterRejected"), value: "rejected" },
  ];
}

function VacationStatusBadge({ status }: { status: VacationRequest["status"] }) {
  const tStatus = useTranslations("VacationStatus");
  const config = getVacationStatusConfig(tStatus)[status];

  return (
    <span
      className={`inline-flex items-center rounded-[7px] px-[9px] py-[3px] font-mono text-[10.5px] ${config.className}`}
    >
      {config.badge}
    </span>
  );
}

function DecisionForm({
  tenant,
  request,
  action,
  children,
  className,
  t,
}: {
  tenant: string;
  request: VacationRequest;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className: string;
  t: T;
}) {
  const [, formAction] = useActionStateWithToast(action);

  return (
    <form action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="requestId" value={request.dbId ?? ""} />
      <FormSubmitButton className={className} pendingLabel={t("decisionPending")}>
        {children}
      </FormSubmitButton>
    </form>
  );
}

function VacationRequestRow({
  tenant,
  request,
  canManage,
  canDelete,
  t,
}: {
  tenant: string;
  request: VacationRequest;
  canManage: boolean;
  canDelete: boolean;
  t: T;
}) {
  const isPending = request.status === "pending";

  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-border-soft px-6 py-3.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
        {request.initials}
      </div>

      <div className="min-w-[130px] flex-1">
        <div className="text-[13.5px] font-semibold text-ink">{request.name}</div>
        <div className="mt-0.5 text-[12px] text-muted">
          {request.location} {"·"} {request.team}
        </div>
      </div>

      <div className="min-w-[132px] flex-1">
        <div className="font-mono text-[12px] text-ink">
          {request.startDate} {"–"} {request.endDate}
        </div>
        <div className="mt-0.5 text-[12px] text-muted">{request.days}</div>
      </div>

      <div className="shrink-0">
        <VacationStatusBadge status={request.status} />
      </div>

      <VacationDrawerButton tenant={tenant} request={request} canManage={canManage} canDelete={canDelete} />

      {isPending && canManage && (
        <div className="flex shrink-0 gap-[7px]">
          <DecisionForm
            tenant={tenant}
            request={request}
            action={approveVacationRequestAction}
            className="cursor-pointer rounded-lg border-0 bg-success px-[13px] py-[7px] text-[12px] font-semibold text-white transition-colors hover:bg-[#2B6845]"
            t={t}
          >
            {t("approve")}
          </DecisionForm>
          <DecisionForm
            tenant={tenant}
            request={request}
            action={rejectVacationRequestAction}
            className="cursor-pointer rounded-lg border border-danger/30 bg-white px-[13px] py-[7px] text-[12px] font-medium text-danger transition-colors hover:border-danger/50 hover:bg-danger/5"
            t={t}
          >
            {t("reject")}
          </DecisionForm>
        </div>
      )}
    </div>
  );
}

export function VacationListClient({
  tenant,
  allRequests,
  pageItems,
  pageInfo,
  canManage,
  canDelete,
}: {
  tenant: string;
  /** Vollständige, unpaginierte Liste — Grundlage für Suche/Filter. */
  allRequests: VacationRequest[];
  /** Serverseitig bereits paginierte aktuelle Seite — Standardanzeige ohne aktive Suche/Filter. */
  pageItems: VacationRequest[];
  pageInfo: { page: number; pageCount: number; total: number; pageSize: number };
  canManage: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("VacationListClient");
  const statusFilters = getStatusFilters(t);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");

  const isFiltering = query.trim() !== "" || statusFilter !== "all";

  const filtered = useMemo(() => {
    if (!isFiltering) {
      return pageItems;
    }

    const activeStatus = statusFilter === "all" ? null : statusFilter;
    const q = query.trim().toLowerCase();

    return allRequests.filter((request) => {
      if (activeStatus && request.status !== activeStatus) {
        return false;
      }

      if (!q) {
        return true;
      }

      return [request.name, request.location, request.team, request.startDate, request.endDate]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [allRequests, pageItems, isFiltering, query, statusFilter]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex w-fit gap-1 rounded-xl border border-border bg-white p-[5px]">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`cursor-pointer rounded-lg px-3.5 py-[7px] text-[13px] transition-colors ${
                statusFilter === filter.value
                  ? "bg-border-soft font-semibold text-ink"
                  : "bg-transparent font-normal text-muted hover:text-ink"
              }`}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <ListSearchBox
          value={query}
          onChange={setQuery}
          placeholder={t("searchPlaceholder")}
          className="max-w-[320px] flex-1"
        />
      </div>

      <section className="overflow-hidden rounded-card border border-border bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 pt-5 pb-3.5">
          <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.4px] text-ink">
            {t("title")}
          </h2>
          <span className="shrink-0 font-mono text-[11px] text-muted">
            {isFiltering
              ? t("entriesFiltered", { filtered: filtered.length, total: allRequests.length })
              : t("entriesTotal", { total: allRequests.length })}
          </span>
        </div>

        {filtered.length > 0 ? (
          filtered.map((request) => (
            <VacationRequestRow
              key={request.dbId ?? request.id}
              tenant={tenant}
              request={request}
              canManage={canManage}
              canDelete={canDelete}
              t={t}
            />
          ))
        ) : (
          <div className="border-t border-border-soft px-6 py-10 text-[13px] text-muted">
            {allRequests.length === 0 ? t("emptyNone") : t("emptyFiltered")}
          </div>
        )}

        {!isFiltering && (
          <PaginationControls
            page={pageInfo.page}
            pageCount={pageInfo.pageCount}
            total={pageInfo.total}
            pageSize={pageInfo.pageSize}
            basePath={`/u/${tenant}/urlaub`}
          />
        )}
      </section>
    </>
  );
}
