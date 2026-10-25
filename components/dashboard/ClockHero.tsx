"use client";

import { clockAction } from "@/app/(dashboard)/u/[tenant]/zeiten/actions";
import { useToast } from "@/components/Toasts";
import { requiredBreakMinutes, type ClockAction } from "@/lib/time-tracking";
import type { ClockStatusView } from "@/lib/time-tracking-service";
import { Coffee, LogIn, Play, Square } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/** Netto-Sekunden des laufenden Blocks bis `nowMs` (gestempelte Pausen abgezogen). */
function runningBlockSeconds(status: ClockStatusView, nowMs: number) {
  const entry = status.openEntry;

  if (!entry) return 0;

  const gross = nowMs - Date.parse(entry.clockInAt);
  const breaks = entry.breaks.reduce(
    (sum, item) => sum + ((item.endAt ? Date.parse(item.endAt) : nowMs) - Date.parse(item.startAt)),
    0,
  );

  return Math.max(0, Math.floor((gross - breaks) / 1000));
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * Stempeluhr als dunkle Kopfkarte ("Mein Bereich"). Logik wie bisher:
 * Server-Uhr maßgeblich, Aktionen über `clockAction`, nach jeder Aktion
 * `router.refresh()`.
 */
export default function ClockHero({
  tenant,
  initialStatus,
}: {
  tenant: string;
  initialStatus: ClockStatusView;
}) {
  const t = useTranslations("TimeTracking");
  const tHero = useTranslations("MyArea.clock");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [clockSkew, setClockSkew] = useState(() => Date.parse(initialStatus.serverTime) - Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now() + clockSkew);

  useEffect(() => {
    if (status.state === "off") return;

    const timer = window.setInterval(() => setNowMs(Date.now() + clockSkew), 1000);

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

  const seconds = runningBlockSeconds(status, nowMs);
  const renderedAt = Date.parse(status.serverTime);
  const elapsedSinceRender = Math.max(0, Math.floor((nowMs - renderedAt) / 60_000));
  const todayMinutes = status.today.workedMinutes + (status.state === "working" ? elapsedSinceRender : 0);
  const todayBreakMinutes = status.today.breakMinutes + (status.state === "break" ? elapsedSinceRender : 0);
  const legalBreak = requiredBreakMinutes(todayMinutes + todayBreakMinutes);
  const breakStillNeeded = Math.max(0, legalBreak - todayBreakMinutes);
  const shift = status.openEntry?.shift?.startAt
    ? {
        startAt: status.openEntry.shift.startAt,
        endAt: status.openEntry.shift.endAt,
        location: status.openEntry.shift.location,
      }
    : status.clockableShift
      ? {
          startAt: status.clockableShift.startAt,
          endAt: status.clockableShift.endAt,
          location: status.clockableShift.location,
        }
      : null;
  const timeFormat = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: status.timeZone,
  });
  const shiftStart = shift ? Date.parse(shift.startAt) : 0;
  const shiftEnd = shift?.endAt ? Date.parse(shift.endAt) : 0;
  const shiftProgress =
    shift && shiftEnd > shiftStart
      ? Math.min(100, Math.max(0, ((nowMs - shiftStart) / (shiftEnd - shiftStart)) * 100))
      : 0;
  const shiftRemaining = shift && shiftEnd > nowMs ? Math.round((shiftEnd - nowMs) / 60_000) : 0;
  const formatShiftDate = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    });

  let eyebrow: string;

  if (status.state === "working" && status.openEntry) {
    eyebrow = tHero("clockedInSince", { time: status.openEntry.clockInTime });
  } else if (status.state === "break") {
    eyebrow = tHero("onBreakSince", {
      time: status.openEntry?.breaks.find((item) => item.endAt === null)?.startTime ?? "",
    });
  } else {
    eyebrow = tHero("notClockedIn");
  }

  const hint =
    status.state === "off" && !status.canClockIn
      ? status.nextShift
        ? `${t("noShiftHint", { minutes: status.settings.clockInLeadMinutes })} ${t("nextShift", {
            date: formatShiftDate(status.nextShift.date),
            start: status.nextShift.startTime,
            end: status.nextShift.endTime,
          })}`
        : t("noUpcomingShift")
      : null;

  return (
    <section
      aria-label={t("clockTitle")}
      className="db-hero relative mb-5 overflow-hidden rounded-[16px] bg-[#0d0d0d] p-[clamp(20px,3vw,28px)] text-[#ededea]"
    >
      <div className="db-hero-glow" aria-hidden="true" />
      <div className="db-hero-in relative grid items-center gap-x-10 gap-y-6 [grid-template-columns:minmax(0,1fr)_minmax(0,260px)]">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="inline-flex items-center gap-2.5 text-[13px] text-[#a3a39e]">
            <span
              className={`${status.state === "working" ? "db-live bg-[#4ade80]" : status.state === "break" ? "bg-[#ffc27a]" : "bg-[#6f6f6b]"} size-2 rounded-full`}
            />
            {eyebrow}
          </span>
          <span className="font-display text-[clamp(44px,6vw,64px)] leading-none font-semibold tracking-[-2px] text-white tabular-nums">
            {status.state === "off"
              ? `${pad(Math.floor(todayMinutes / 60))}:${pad(todayMinutes % 60)}`
              : `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`}
          </span>
          {status.state === "off" && (
            <span className="text-[12.5px] text-[#a3a39e]">{tHero("workedToday")}</span>
          )}
          {(status.settings.breaksEnabled || todayBreakMinutes > 0) && (
            <span className="inline-flex w-fit flex-wrap items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-[12.5px] text-[#a3a39e] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
              <Coffee size={13} />
              {tHero("breakToday")}
              <strong className="font-semibold text-white">{tHero("minutes", { count: todayBreakMinutes })}</strong>
              {legalBreak > 0 && (
                <span>
                  ·{" "}
                  {breakStillNeeded > 0
                    ? tHero("breakNeeded", { remaining: breakStillNeeded, total: legalBreak })
                    : tHero("breakDone")}
                </span>
              )}
            </span>
          )}
          {shift && (
            <>
              <span className="text-[13.5px] text-[#a3a39e]">
                {tHero("shiftToday")}{" "}
                <strong className="font-semibold text-white">
                  {timeFormat.format(new Date(shift.startAt))}
                  {shift.endAt ? ` – ${timeFormat.format(new Date(shift.endAt))}` : ""}
                </strong>
                {shift.location ? ` · ${shift.location}` : ""}
              </span>
              {shift.endAt && (
                <span className="flex max-w-[420px] items-center gap-3">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full bg-[#a78ee8]"
                      style={{ width: `${shiftProgress}%` }}
                    />
                  </span>
                  {shiftRemaining > 0 && (
                    <span className="text-[12.5px] whitespace-nowrap text-[#a3a39e]">
                      {tHero("remaining", {
                        hours: Math.floor(shiftRemaining / 60),
                        minutes: shiftRemaining % 60,
                      })}
                    </span>
                  )}
                </span>
              )}
            </>
          )}
          {hint && <span className="text-[13px] text-[#a3a39e]">{hint}</span>}
        </div>

        <div className="flex flex-col gap-2.5">
          {status.state === "off" && status.canClockIn && !status.settings.qrRequired && (
            <button
              type="button"
              disabled={isPending}
              className="db-light-btn db-focus inline-flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-white px-4 text-[15px] font-semibold text-ink disabled:opacity-60"
              onClick={() => run("clockIn", "clockedIn")}
            >
              <LogIn size={16} />
              {t("clockIn")}
            </button>
          )}
          {status.state !== "off" && !status.settings.qrRequiredClockOut && (
            <button
              type="button"
              disabled={isPending}
              className="db-light-btn db-focus inline-flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-white px-4 text-[15px] font-semibold text-ink disabled:opacity-60"
              onClick={() => run("clockOut", "clockedOut")}
            >
              <Square size={14} />
              {t("clockOut")}
            </button>
          )}
          {status.state === "working" && status.settings.breaksEnabled && (
            <button
              type="button"
              disabled={isPending}
              className="db-glass-dark db-focus inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-white/[0.07] px-4 text-[14px] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] disabled:opacity-60"
              onClick={() => run("breakStart", "breakStarted")}
            >
              {t("breakStart")}
            </button>
          )}
          {status.state === "break" && (
            <button
              type="button"
              disabled={isPending}
              className="db-glass-dark db-focus inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-white/[0.07] px-4 text-[14px] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] disabled:opacity-60"
              onClick={() => run("breakEnd", "breakEnded")}
            >
              <Play size={14} />
              {t("breakEnd")}
            </button>
          )}
          {((status.state === "off" && status.settings.qrRequired) ||
            (status.state !== "off" && status.settings.qrRequiredClockOut)) && (
            <span className="text-center text-[12.5px] text-[#8f8f8a]">{tHero("qrHint")}</span>
          )}
        </div>
      </div>
    </section>
  );
}
