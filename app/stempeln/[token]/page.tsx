import { getTranslations } from "next-intl/server";
import Link from "next/link";

export async function generateMetadata() {
  const t = await getTranslations("ClockQrLanding");
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * Ziel der URL im Stempel-QR-Code (lib/time-clock-qr.ts), wenn jemand ihn
 * mit der normalen Handykamera statt in der App scannt. Verrät bewusst
 * nichts über das Token (weder Betrieb noch Standort) und stempelt nicht —
 * Stempeln geht nur angemeldet in der App.
 */
export default async function ClockQrLandingPage() {
  const t = await getTranslations("ClockQrLanding");

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-[520px] flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="m-0 font-display text-[28px] font-semibold tracking-[-0.6px] text-ink">{t("title")}</h1>
      <p className="m-0 text-[14.5px] leading-[1.6] text-muted-2">{t("body")}</p>
      <Link href="/" className="btn btn-secondary btn-sm">
        {t("home")}
      </Link>
    </main>
  );
}
