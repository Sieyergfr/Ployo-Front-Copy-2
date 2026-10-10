"use client";

import { regenerateLocationClockQrAction } from "@/app/(dashboard)/u/[tenant]/standorte/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import { Printer, QrCode } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Stempel-QR-Code des Standorts (Zeiterfassung mit QR-Pflicht in der App).
 * Das SVG rendert der Server (lib/time-clock-qr-svg.ts) aus der eigenen
 * Stempel-URL — kein Nutzerinhalt, daher als Markup eingesetzt.
 */
export default function LocationClockQrPanel({
  tenant,
  locationId,
  printHref,
  svg,
  qrRequired,
}: {
  tenant: string;
  locationId: string;
  printHref: string;
  svg: string | null;
  qrRequired: boolean;
}) {
  const t = useTranslations("LocationClockQr");
  const [, formAction, isPending] = useActionStateWithToast(regenerateLocationClockQrAction);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="locationId" value={locationId} />

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        {qrRequired ? t("descriptionActive") : t("descriptionInactive")}
      </p>

      {svg ? (
        <div className="flex flex-wrap items-center gap-5">
          <div
            className="size-[148px] shrink-0 rounded-[12px] border border-border-soft bg-white p-2 [&>svg]:size-full"
            aria-label={t("qrAlt")}
            role="img"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div className="flex min-w-[180px] flex-1 flex-col gap-2.5">
            <a href={printHref} target="_blank" rel="noopener" className="btn btn-primary btn-sm self-start">
              <Printer size={14} />
              {t("print")}
            </a>
            <ConfirmSubmitButton
              className="btn btn-secondary btn-sm self-start"
              title={t("regenerateConfirmTitle")}
              description={t("regenerateConfirmDescription")}
              confirmLabel={t("regenerate")}
            >
              {t("regenerate")}
            </ConfirmSubmitButton>
            <p className="m-0 text-[11.5px] leading-[1.5] text-muted">{t("regenerateHint")}</p>
          </div>
        </div>
      ) : (
        <button type="submit" className="btn btn-primary btn-sm self-start" disabled={isPending}>
          <QrCode size={14} />
          {isPending ? t("generating") : t("generate")}
        </button>
      )}
    </form>
  );
}
