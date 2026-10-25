"use client";

import { DbDrawer } from "@/components/dashboard/DbDrawer";
import { TimeCorrectionForm } from "@/components/dashboard/MyQuickActions";
import { DbCtaButton } from "@/components/dashboard/ui";
import { History } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

/** Kopfaktionen "Meine Zeiten": Woche/Monat und "Korrektur beantragen". */
export default function MyTimesActions({ tenant, period }: { tenant: string; period: "week" | "month" }) {
  const t = useTranslations("MyTimes");
  const [open, setOpen] = useState(false);
  const tabClass = (active: boolean) =>
    `db-focus inline-flex min-h-9 items-center rounded-[7px] px-3.5 text-[13px] font-semibold no-underline ${
      active ? "bg-white text-ink shadow-[0_1px_2px_rgba(14,14,14,0.08)]" : "text-[#6e6e6b]"
    }`;

  return (
    <>
      <div role="tablist" aria-label={t("period")} className="inline-flex gap-0.5 rounded-[10px] bg-[#f2f1ed] p-1 shadow-[inset_0_0_0_1px_#ecebe7]">
        <Link role="tab" aria-selected={period === "week"} href={`/u/${tenant}/zeiten?period=week`} className={tabClass(period === "week")}>
          {t("week")}
        </Link>
        <Link role="tab" aria-selected={period === "month"} href={`/u/${tenant}/zeiten?period=month`} className={tabClass(period === "month")}>
          {t("month")}
        </Link>
      </div>
      <DbCtaButton onClick={() => setOpen(true)}>
        <History size={15} />
        <span>{t("requestCorrection")}</span>
      </DbCtaButton>
      {open && (
        <DbDrawer title={t("requestCorrection")} subtitle={t("correctionDrawerSub")} width={460} onClose={() => setOpen(false)}>
          <TimeCorrectionForm tenant={tenant} onDone={() => setOpen(false)} />
        </DbDrawer>
      )}
    </>
  );
}
