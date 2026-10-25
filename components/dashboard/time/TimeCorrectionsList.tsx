"use client";

import { decideTimeCorrectionAction } from "@/app/(dashboard)/u/[tenant]/zeiterfassung/actions";
import { dbInputClass } from "@/components/dashboard/DbDrawer";
import { useActionStateWithToast } from "@/components/Toasts";
import type { TimeCorrectionRequestView } from "@/lib/time-correction-service";
import { ArrowRight, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

function DecisionForm({ tenant, request }: { tenant: string; request: TimeCorrectionRequestView }) {
  const t = useTranslations("TimeUi.corrections");
  const [note, setNote] = useState("");
  const [, formAction, isPending] = useActionStateWithToast(decideTimeCorrectionAction);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="requestId" value={request.id} />
      <input
        name="note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        placeholder={t("notePlaceholder")}
        aria-label={t("notePlaceholder")}
        className={`${dbInputClass} h-9 min-h-9 w-[200px] py-1 text-[13px]`}
      />
      <button
        type="submit"
        name="decision"
        value="rejected"
        disabled={isPending}
        className="db-decline db-focus min-h-9 cursor-pointer rounded-[9px] border border-[rgba(180,51,42,0.25)] bg-white px-3 text-[13px] font-medium text-[#b4332a] disabled:opacity-60"
      >
        {t("reject")}
      </button>
      <button
        type="submit"
        name="decision"
        value="approved"
        disabled={isPending}
        className="db-approve db-focus inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[9px] border border-ink bg-ink px-3 text-[13px] font-medium text-white disabled:opacity-60"
      >
        <Check size={13} strokeWidth={2.6} />
        {t("approve")}
      </button>
    </form>
  );
}

export default function TimeCorrectionsList({
  tenant,
  requests,
  canDecide,
}: {
  tenant: string;
  requests: TimeCorrectionRequestView[];
  canDecide: boolean;
}) {
  const t = useTranslations("TimeUi.corrections");
  const locale = useLocale();
  const day = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const dateTime = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const pending = requests.filter((request) => request.status === "pending");
  const decided = requests.filter((request) => request.status !== "pending").slice(0, 20);

  if (requests.length === 0) {
    return <p className="m-0 px-5 py-10 text-center text-[13px] text-[#6e6e6b]">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col">
      {[...pending, ...decided].map((request) => (
        <div key={request.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#f0efeb] px-5 py-3.5 first:border-t-0">
          <span className="flex min-w-[180px] flex-1 flex-col">
            <span className="text-[14.5px] font-semibold">{request.employeeName}</span>
            <span className="text-[12.5px] text-[#6e6e6b]">
              {day.format(new Date(`${request.date}T12:00:00Z`))} · {t("requestedAt", { date: dateTime.format(new Date(request.createdAt)) })}
            </span>
          </span>
          <span className="flex items-center gap-2 font-mono text-[13px]">
            <span className="text-[#9a9a96]">
              {request.currentStartTime ? `${request.currentStartTime}–${request.currentEndTime ?? t("missing")}` : t("noEntry")}
            </span>
            <ArrowRight size={13} className="text-[#9a9a96]" />
            <strong className="font-semibold text-ink">
              {request.requestedStartTime}–{request.requestedEndTime}
            </strong>
            {request.requestedBreakMinutes !== null && (
              <span className="text-[#6e6e6b]">· {t("breakMinutes", { minutes: request.requestedBreakMinutes })}</span>
            )}
          </span>
          <span className="min-w-[140px] flex-1 text-[13px] text-[#3d3d3a]">{request.reason || "–"}</span>
          {request.status === "pending" ? (
            canDecide ? (
              <DecisionForm tenant={tenant} request={request} />
            ) : (
              <span className="rounded-[7px] bg-[#fff7ea] px-2 py-[3px] text-[12px] font-medium text-[#9a5b00]">{t("status.pending")}</span>
            )
          ) : (
            <span className="flex flex-col items-end">
              <span
                className={`rounded-[7px] px-2 py-[3px] text-[12px] font-medium ${request.status === "approved" ? "bg-[rgba(53,122,82,0.10)] text-[#1f5d2c]" : request.status === "rejected" ? "bg-[rgba(180,51,42,0.08)] text-[#b4332a]" : "bg-[#f2f1ed] text-[#6e6e6b]"}`}
              >
                {t(`status.${request.status}`)}
              </span>
              {request.decidedBy && <span className="mt-0.5 text-[11.5px] text-[#9a9a96]">{request.decidedBy}</span>}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
