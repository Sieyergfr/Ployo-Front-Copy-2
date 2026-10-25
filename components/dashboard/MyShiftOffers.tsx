"use client";

import { respondShiftOfferAction } from "@/app/(dashboard)/u/[tenant]/mein-bereich/actions";
import { ctaClass, DbCard, DbCardTitle, secondaryClass } from "@/components/dashboard/ui";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import type { MyShiftOffer } from "@/lib/shift-offer-service";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

/** Angebotene Schichten ("Schicht frei") — wer zuerst annimmt, bekommt sie. */
export default function MyShiftOffers({ tenant, offers, locale }: { tenant: string; offers: MyShiftOffer[]; locale: string }) {
  const t = useTranslations("MyArea");
  const [, formAction] = useActionStateWithToast(respondShiftOfferAction);
  const dateFormat = new Intl.DateTimeFormat(locale, { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });

  if (offers.length === 0) {
    return null;
  }

  return (
    <DbCard aria-labelledby="my-shift-offers" className="mb-5 border-[rgba(139,110,212,0.35)]">
      <DbCardTitle id="my-shift-offers" title={t("shiftOffersTitle")} subtitle={t("shiftOffersSubtitle")} />
      <div className="flex flex-col gap-2.5">
        {offers.map((offer) => (
          <div key={offer.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[#ecebe7] bg-[#fafaf8] px-4 py-3">
            <span className="flex min-w-[180px] flex-1 flex-col gap-0.5">
              <span className="text-[14.5px] font-semibold">
                {dateFormat.format(new Date(`${offer.date}T12:00:00Z`))} · {offer.startTime} – {offer.endTime}
              </span>
              <span className="text-[12.5px] text-[#6e6e6b]">
                {[
                  offer.location,
                  offer.team,
                  offer.replacesFirstName ? t("shiftOfferReplaces", { name: offer.replacesFirstName }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <form action={formAction} className="flex gap-2">
              <input type="hidden" name="tenant" value={tenant} />
              <input type="hidden" name="offerId" value={offer.id} />
              <FormSubmitButton name="decision" value="decline" className={`${secondaryClass} min-h-10`}>
                {t("shiftOfferDecline")}
              </FormSubmitButton>
              <FormSubmitButton name="decision" value="accept" Icon={Check} className={`${ctaClass} min-h-10`}>
                {t("shiftOfferAccept")}
              </FormSubmitButton>
            </form>
          </div>
        ))}
      </div>
    </DbCard>
  );
}
