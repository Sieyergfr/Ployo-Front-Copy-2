import { requestAccessAction } from "@/app/actions/self-service-requests";
import { ctaClass, secondaryClass } from "@/components/dashboard/ui";
import SelfServiceRequestButton from "@/components/SelfServiceRequestButton";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

/**
 * Hinweis bei fehlender Berechtigung. Bewusst ohne "use client" und ohne
 * async: wird sowohl von der Serverseite kein-zugriff als auch aus der
 * Client-Fehlergrenze (u/[tenant]/error.tsx) gerendert.
 */
export default function NoAccessNotice({ tenant, path = "" }: { tenant: string; path?: string }) {
  const t = useTranslations("NoAccessNotice");

  return (
    <section className="db-card flex flex-col items-center gap-3 rounded-[16px] border border-[#ecebe7] bg-white px-6 py-16 text-center">
      <span className="mb-2 flex size-16 items-center justify-center rounded-[16px] bg-ink text-[#c9b8f5] shadow-[0_10px_30px_rgba(139,110,212,0.35)]">
        <Lock size={24} />
      </span>
      <h1 className="m-0 font-display text-[22px] font-semibold tracking-[-0.4px] text-ink">{t("title")}</h1>
      <p className="m-0 max-w-[440px] text-[14px] leading-[1.6] text-[#6e6e6b]">{t("body")}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <SelfServiceRequestButton
          action={requestAccessAction}
          fields={{ tenant, path }}
          className={ctaClass}
          doneLabel={t("requested")}
          successTitle={t("requestedToast")}
          successSubtitle={t("requestedToastBody")}
        >
          {t("requestAccess")}
        </SelfServiceRequestButton>
        <Link href={`/u/${tenant}/mein-bereich`} className={secondaryClass}>
          {t("toMyArea")}
        </Link>
      </div>
    </section>
  );
}
