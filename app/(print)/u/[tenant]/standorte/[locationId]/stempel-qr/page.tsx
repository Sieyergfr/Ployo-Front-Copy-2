import PrintButton from "@/components/PrintButton";
import { getLocationClockQr } from "@/lib/location-service";
import { withAccessRedirect } from "@/lib/tenant-access";
import { renderClockQrSvg } from "@/lib/time-clock-qr-svg";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export async function generateMetadata() {
  const t = await getTranslations("LocationClockQr");
  return { title: t("printTitle"), robots: { index: false, follow: false } };
}

/**
 * Druckansicht des Stempel-QR-Codes (A4, zum Aushängen am Standort) —
 * bewusst außerhalb der Dashboard-Gruppe, damit keine Navigation mitgedruckt
 * wird. Zugriff wie auf der Standortseite: nur Standort-Verwalter.
 */
export default async function LocationClockQrPrintPage({
  params,
}: {
  params: Promise<{ tenant: string; locationId: string }>;
}) {
  const { tenant, locationId } = await params;
  const t = await getTranslations("LocationClockQr");
  const clockQr = await withAccessRedirect(tenant, () => getLocationClockQr(tenant, locationId));

  if (!clockQr) notFound();

  const backHref = `/u/${tenant}/standorte/${clockQr.locationKey}`;

  if (!clockQr.payload) {
    return (
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-16 text-center">
        <p className="text-[14px] text-muted-2">{t("notGeneratedYet")}</p>
        <Link href={backHref} className="btn btn-secondary self-center">
          {t("back")}
        </Link>
      </main>
    );
  }

  const svg = await renderClockQrSvg(clockQr.payload);

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col items-center px-4 py-10 print:py-0">
      <style>{"@page { size: A4 portrait; margin: 18mm; }"}</style>
      <div className="mb-8 flex w-full items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="btn btn-secondary btn-sm">
          {t("back")}
        </Link>
        <PrintButton label={t("print")} />
      </div>

      <section className="flex w-full flex-col items-center rounded-card border border-border bg-white px-6 py-10 text-center print:border-0 print:px-0">
        <div className="font-mono text-[12px] uppercase tracking-[0.8px] text-muted">{t("printEyebrow")}</div>
        <h1 className="mt-3 mb-0 font-display text-[clamp(28px,6vw,44px)] font-semibold leading-[1.05] tracking-[-1px] text-ink">
          {clockQr.locationName}
        </h1>
        <div
          className="my-8 aspect-square w-full max-w-[420px] [&>svg]:size-full"
          role="img"
          aria-label={t("qrAlt")}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="m-0 max-w-[460px] text-[16px] leading-[1.5] text-ink">{t("printInstruction")}</p>
        <p className="mt-3 mb-0 max-w-[460px] text-[13px] leading-[1.5] text-muted-2">{t("printFooter")}</p>
      </section>
    </main>
  );
}
