"use client";

import { ctaClass } from "@/components/dashboard/ui";
import { Timer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

const DAY_MS = 86_400_000;
const TRIAL_DAYS = 14;

/** Hinweis während der Stripe-Testphase (nur für Personen, die das Abo verwalten dürfen). */
export default function TrialBanner({ tenantSlug, trialEnd }: { tenantSlug: string; trialEnd: string }) {
  const t = useTranslations("TrialBanner");
  const locale = useLocale();
  const [now] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(false);
  const end = new Date(trialEnd);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now) / DAY_MS));

  if (dismissed || Number.isNaN(end.getTime())) return null;

  const progress = Math.min(100, Math.max(4, ((TRIAL_DAYS - daysLeft) / TRIAL_DAYS) * 100));

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[14px] border border-[rgba(139,111,224,0.28)] bg-white/80 px-3.5 py-2.5 shadow-[0_8px_30px_-18px_rgba(139,110,212,0.6)]">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-ink text-white">
        <Timer size={15} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[14px]">
          <strong>{t("daysLeft", { count: daysLeft })}</strong>
          <span className="text-[#6e6e6b]"> · {t("endsOn", { date: end.toLocaleDateString(locale === "en" ? "en-GB" : "de-DE") })}</span>
        </span>
        <span className="h-[3px] w-full max-w-[260px] overflow-hidden rounded-full bg-[#ecebe7]">
          <span className="block h-full rounded-full bg-[#8b6ed4]" style={{ width: `${progress}%` }} />
        </span>
      </span>
      <button type="button" className="cursor-pointer border-0 bg-transparent px-2 text-[13.5px] font-medium text-[#6e6e6b] hover:text-ink" onClick={() => setDismissed(true)}>
        {t("later")}
      </button>
      <Link href={`/u/${tenantSlug}/einstellungen?kat=billing`} className={`${ctaClass} min-h-9 px-3.5 text-[13.5px]`}>
        {t("choosePlan")}
      </Link>
    </div>
  );
}
