"use client";

import {
  loadShiftOfferCandidatesAction,
  offerShiftAction,
  type ShiftOfferCandidatesResult,
  type ShiftOfferState,
} from "@/app/(dashboard)/u/[tenant]/schichtplanung/actions";
import { DbDrawer } from "@/components/dashboard/DbDrawer";
import { secondaryClass } from "@/components/dashboard/ui";
import { useToast } from "@/components/Toasts";
import type { ShiftOfferCandidate } from "@/lib/shift-offers";
import { Check, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

const avatarColors = ["#2a5bc9", "#4a5568", "#1d8a65", "#c9622a", "#7a3c9c", "#b7791f", "#168a8a", "#c23b7a"];

function colorFor(name: string) {
  let hash = 0;

  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;

  return avatarColors[hash % avatarColors.length];
}

function hours(minutes: number) {
  return (Math.round((minutes / 60) * 10) / 10).toLocaleString("de-DE");
}

/**
 * "Vertretung finden" / "Schicht anbieten": bewertet passende Personen und
 * fragt sie per Push an. Wer zuerst in der App (oder unter "Mein Bereich")
 * zusagt, bekommt die Schicht.
 */
export default function ShiftOfferDrawer({
  tenant,
  shiftId,
  onClose,
}: {
  tenant: string;
  shiftId: string;
  onClose: () => void;
}) {
  const t = useTranslations("ShiftUi");
  const router = useRouter();
  const { toast } = useToast();
  const [result, setResult] = useState<ShiftOfferCandidatesResult | null>(null);
  const [reload, setReload] = useState(0);
  const [state, formAction, isPending] = useActionState<ShiftOfferState, FormData>(
    async (previous, formData) => {
      const next = await offerShiftAction(previous, formData);

      if (next.error) {
        toast({ title: next.error, tone: "error" });
      } else if (next.success) {
        toast({
          title: t("sentToast", { count: next.sent ?? 0 }),
          subtitle: next.withoutAccount ? t("sentWithoutAccount", { count: next.withoutAccount }) : undefined,
          tone: "success",
        });
        setReload((value) => value + 1);
        router.refresh();
      }

      return next;
    },
    {},
  );

  useEffect(() => {
    let cancelled = false;

    loadShiftOfferCandidatesAction(tenant, shiftId).then((next) => {
      if (!cancelled) setResult(next);
    });

    return () => {
      cancelled = true;
    };
  }, [tenant, shiftId, reload]);

  const context = result?.ok ? result.context : null;
  const candidates = context?.candidates ?? [];
  const askable = candidates.filter((candidate) => candidate.score > 0 && candidate.hasAccount && !candidate.offerStatus);
  const shift = context?.shift;
  const dateLabel = shift
    ? new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(
        new Date(`${shift.date}T12:00:00Z`),
      )
    : "";

  return (
    <DbDrawer
      title={shift?.replacedEmployeeName ? t("substituteTitle") : t("offerTitle")}
      onClose={onClose}
      width={460}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12.5px] text-[#6e6e6b]">{t("firstWins")}</span>
          <form action={formAction}>
            <input type="hidden" name="tenant" value={tenant} />
            <input type="hidden" name="shiftId" value={shiftId} />
            {askable.map((candidate) => (
              <input key={candidate.employeeId} type="hidden" name="employeeId" value={candidate.employeeId} />
            ))}
            <button type="submit" className={secondaryClass} disabled={isPending || askable.length === 0}>
              {t("askAll")}
            </button>
          </form>
        </div>
      }
    >
      {shift && (
        <div className="relative overflow-hidden rounded-[16px] bg-[#16161a] p-5 text-white">
          <span className="font-display text-[26px] font-semibold tracking-[-0.8px]">
            {shift.startTime} – {shift.endTime}
          </span>
          <span className="mt-1 block text-[13px] text-[#a3a39e]">
            {[dateLabel, shift.location, shift.team].filter(Boolean).join(" · ")}
          </span>
          <div className="mt-3.5 flex items-center gap-2.5 border-t border-white/10 pt-3.5 text-[13px] text-[#a3a39e]">
            {shift.replacedEmployeeName ? (
              <span>
                {t.rich("substituteFor", {
                  name: shift.replacedEmployeeName,
                  strong: (chunks) => <strong className="font-semibold text-white">{chunks}</strong>,
                })}
                {shift.replacedAbsence && ` · ${shift.replacedAbsence === "vacation" ? t("absenceVacation") : t("absenceOther")}`}
              </span>
            ) : (
              <span>{t("openShiftLabel")}</span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold">{t("candidatesTitle")}</span>
        <span className="text-[12.5px] leading-[1.5] text-[#6e6e6b]">{t("candidatesHint")}</span>
      </div>

      {!result && <p className="m-0 text-[13px] text-[#6e6e6b]">{t("loading")}</p>}
      {result && !result.ok && <p className="m-0 text-[13px] text-[#b4332a]">{result.error}</p>}
      {context && candidates.length === 0 && <p className="m-0 text-[13px] text-[#6e6e6b]">{t("noCandidates")}</p>}

      <div className="flex flex-col gap-2.5">
        {candidates.map((candidate, index) => (
          <CandidateCard
            key={candidate.employeeId}
            candidate={candidate}
            best={index === 0 && candidate.score > 0}
            tenant={tenant}
            shiftId={shiftId}
            formAction={formAction}
            isPending={isPending}
          />
        ))}
      </div>
      {state.error && <span className="sr-only">{state.error}</span>}
    </DbDrawer>
  );
}

function CandidateCard({
  candidate,
  best,
  tenant,
  shiftId,
  formAction,
  isPending,
}: {
  candidate: ShiftOfferCandidate;
  best: boolean;
  tenant: string;
  shiftId: string;
  formAction: (formData: FormData) => void;
  isPending: boolean;
}) {
  const t = useTranslations("ShiftUi");
  const blocked = candidate.score === 0;

  return (
    <div
      className={`flex flex-col gap-3 rounded-[14px] border p-3.5 ${best ? "border-[rgba(139,110,212,0.45)] bg-[rgba(167,142,232,0.06)]" : "border-[#ecebe7] bg-white"} ${blocked ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
          style={{ background: colorFor(candidate.name) }}
        >
          {candidate.initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14.5px] font-semibold">{candidate.name}</span>
            {best && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(139,110,212,0.12)] px-2 py-[2px] text-[11px] font-semibold text-[#5b3fb0]">
                {t("bestMatch")}
              </span>
            )}
          </span>
          <span className="truncate text-[12.5px] text-[#6e6e6b]">
            {[
              candidate.team,
              candidate.targetMinutes
                ? t("hoursOf", { planned: hours(candidate.plannedMinutes), target: hours(candidate.targetMinutes) })
                : t("hoursPlanned", { planned: hours(candidate.plannedMinutes) }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="flex flex-col items-end">
          <span className="font-display text-[18px] font-semibold">{candidate.score}</span>
          <span className="font-mono text-[9.5px] tracking-[0.08em] text-[#9a9a96] uppercase">{t("fit")}</span>
        </span>
      </div>

      {blocked ? (
        <span className="text-[12.5px] text-[#b4332a]">
          {t("unavailable")}
          {candidate.blockedReason ? ` · ${candidate.blockedReason}` : ""}
        </span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {candidate.checks.map((check) => (
            <span
              key={check.id}
              className={`inline-flex items-center gap-1 rounded-[7px] px-2 py-[3px] text-[11.5px] font-medium ${check.ok ? "bg-[rgba(53,122,82,0.10)] text-[#1f5d2c]" : "bg-[#f2f1ed] text-[#9a9a96]"}`}
            >
              {check.ok ? <Check size={11} strokeWidth={2.5} /> : <X size={11} strokeWidth={2.5} />}
              {t(`check.${check.id}`)}
            </span>
          ))}
        </div>
      )}

      {!blocked && candidate.offerStatus === "pending" && (
        <div role="status" className="flex items-center justify-between rounded-[10px] bg-[rgba(53,122,82,0.08)] px-3 py-2 text-[12.5px] font-medium text-[#1f5d2c]">
          <span className="inline-flex items-center gap-1.5">
            <Check size={14} strokeWidth={2.5} />
            {t("asked")}
          </span>
          <span className="text-[#6e6e6b]">{t("waiting")}</span>
        </div>
      )}
      {candidate.offerStatus && candidate.offerStatus !== "pending" && (
        <span className="text-[12.5px] text-[#6e6e6b]">
          {candidate.offerStatus === "accepted" ? t("acceptedBy") : candidate.offerStatus === "declined" ? t("declined") : t("closed")}
        </span>
      )}
      {!blocked && !candidate.offerStatus && (
        candidate.hasAccount ? (
          <form action={formAction}>
            <input type="hidden" name="tenant" value={tenant} />
            <input type="hidden" name="shiftId" value={shiftId} />
            <input type="hidden" name="employeeId" value={candidate.employeeId} />
            <button
              type="submit"
              disabled={isPending}
              className="db-cta db-focus relative inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-[10px] border border-[rgba(167,142,232,0.45)] bg-ink px-4 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              <Send size={15} />
              {t("ask")}
            </button>
          </form>
        ) : (
          <span className="text-[12.5px] text-[#9a9a96]">{t("noAccount")}</span>
        )
      )}
    </div>
  );
}
