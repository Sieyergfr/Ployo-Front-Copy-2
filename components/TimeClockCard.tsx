"use client";

import { clockAction } from "@/app/(dashboard)/u/[tenant]/zeiten/actions";
import { useToast } from "@/components/Toasts";
import { formatDuration, type ClockAction } from "@/lib/time-tracking";
import type { ClockStatusView } from "@/lib/time-tracking-service";
import { Coffee, LogIn, LogOut, Play, Timer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/** Netto-Minuten des laufenden Blocks bis `nowMs` (gestempelte Pausen abgezogen). */
function runningBlockMinutes(status: ClockStatusView, nowMs: number) {
  const entry = status.openEntry;
  if (!entry) return 0;

  const gross = nowMs - Date.parse(entry.clockInAt);
  const breaks = entry.breaks.reduce(
    (sum, item) => sum + ((item.endAt ? Date.parse(item.endAt) : nowMs) - Date.parse(item.startAt)),
    0,
  );

  return Math.max(0, Math.floor((gross - breaks) / 60_000));
}

export default function TimeClockCard({
  tenant,
  initialStatus,
}: {
  tenant: string;
  initialStatus: ClockStatusView;
}) {
  const t = useTranslations("TimeTracking");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  // Uhr des Servers maßgeblich — Abweichung der Browser-Uhr einmal merken.
  const [clockSkew, setClockSkew] = useState(() => Date.parse(initialStatus.serverTime) - Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now() + clockSkew);

  useEffect(() => {
    if (status.state === "off") return;
    const timer = window.setInterval(() => setNowMs(Date.now() + clockSkew), 15_000);
    return () => window.clearInterval(timer);
  }, [status.state, clockSkew]);

  if (!status.enabled) return null;

  const run = (action: ClockAction, successKey: string) => {
    startTransition(async () => {
      const result = await clockAction(tenant, action);

      if (result.error || !result.status) {
        toast({ tone: "error", title: result.error ?? t("clockTitle") });
        return;
      }

      const skew = Date.parse(result.status.serverTime) - Date.now();
      setClockSkew(skew);
      setNowMs(Date.now() + skew);
      setStatus(result.status);
      toast({ tone: "success", title: t(successKey) });
      router.refresh();
    });
  };

  const blockMinutes = runningBlockMinutes(status, nowMs);
  const renderedAt = Date.parse(status.serverTime);
  const todayMinutes =
    status.today.workedMinutes +
    (status.state === "working" ? Math.max(0, Math.floor((nowMs - renderedAt) / 60_000)) : 0);
  const stateLabel =
    status.state === "working" ? t("stateWorking") : status.state === "break" ? t("stateBreak") : t("stateOff");
  const tone =
    status.state === "working"
      ? "bg-[#E7F6EC] text-[#1F7A3E]"
      : status.state === "break"
        ? "bg-[#FFF4E0] text-[#9A5B00]"
        : "bg-bg text-muted-2";
  const formatShiftDate = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    });

  // Nicht eingestempelt: entweder die Schicht, auf die sich das Einstempeln
  // bezieht, oder — im Modus "nur rund um Schichten" — warum der Knopf fehlt.
  const shift = status.clockableShift;
  let hint: string | null = null;

  if (status.state === "off" && status.canClockIn && shift) {
    hint = shift.location
      ? t("shiftInfoLocation", { start: shift.startTime, end: shift.endTime, location: shift.location })
      : t("shiftInfo", { start: shift.startTime, end: shift.endTime });
  } else if (status.state === "off" && !status.canClockIn) {
    hint = status.nextShift
      ? `${t("noShiftHint", { minutes: status.settings.clockInLeadMinutes })} ${t("nextShift", {
          date: formatShiftDate(status.nextShift.date),
          start: status.nextShift.startTime,
          end: status.nextShift.endTime,
        })}`
      : t("noUpcomingShift");
  }

  return (
    <section className="rounded-card border border-border bg-white px-6 py-[22px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
          <Timer size={17} />
          {t("clockTitle")}
        </h2>
        <span className={`rounded-full px-2.5 py-1 font-mono text-[10.5px] font-semibold ${tone}`}>
          {stateLabel}
          {status.openEntry && status.state === "working"
            ? ` · ${t("since", { time: status.openEntry.clockInTime })}`
            : ""}
          {status.state === "break" && status.currentBreakStartAt && status.openEntry
            ? ` · ${t("breakSince", {
                time:
                  status.openEntry.breaks.find((item) => item.endAt === null)?.startTime ?? "",
              })}`
            : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex gap-8">
          {status.state !== "off" && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-muted">
                {t("currentBlock")}
              </div>
              <div className="mt-1 font-display text-[28px] font-semibold tabular-nums text-ink">
                {formatDuration(blockMinutes)}
              </div>
            </div>
          )}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-muted">
              {t("todayTotal")}
            </div>
            <div className="mt-1 font-display text-[28px] font-semibold tabular-nums text-ink">
              {formatDuration(todayMinutes)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {status.state === "off" && status.canClockIn && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={isPending}
              onClick={() => run("clockIn", "clockedIn")}
            >
              <LogIn size={15} />
              {t("clockIn")}
            </button>
          )}
          {status.state === "working" && status.settings.breaksEnabled && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isPending}
              onClick={() => run("breakStart", "breakStarted")}
            >
              <Coffee size={15} />
              {t("breakStart")}
            </button>
          )}
          {status.state === "break" && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isPending}
              onClick={() => run("breakEnd", "breakEnded")}
            >
              <Play size={15} />
              {t("breakEnd")}
            </button>
          )}
          {status.state !== "off" && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={isPending}
              onClick={() => run("clockOut", "clockedOut")}
            >
              <LogOut size={15} />
              {t("clockOut")}
            </button>
          )}
        </div>
      </div>

      {hint && <div className="mt-3 text-[12.5px] text-muted">{hint}</div>}
    </section>
  );
}
