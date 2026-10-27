import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Seite nicht gefunden",
};

const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-[rgba(167,142,232,0.45)] bg-ink px-[18px] text-[14px] font-semibold text-white no-underline shadow-[0_10px_30px_-8px_rgba(139,110,212,0.7)]";
const secondaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-[#ecebe7] bg-white px-4 text-[14px] font-semibold text-ink no-underline";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  const tFooter = await getTranslations("Auth.footer");

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-[#fafaf8] text-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 size-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(167,142,232,0.28) 0%, rgba(167,142,232,0.10) 40%, transparent 70%)" }}
      />
      <header className="relative mx-auto box-border flex w-full max-w-[1200px] px-[clamp(16px,4vw,60px)] pt-6">
        <Link href="/" className="flex items-center gap-2 text-ink no-underline">
          <Image src="/logo_square_brand.svg" alt="" width={22} height={22} />
          <span className="font-display text-[18px] leading-none font-semibold tracking-[-0.4px]">Ployo</span>
        </Link>
      </header>
      <main className="relative flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p
          className="m-0 bg-clip-text font-display text-[clamp(96px,16vw,168px)] leading-none font-semibold tracking-[-6px] text-transparent"
          style={{ backgroundImage: "linear-gradient(180deg, #0e0e0e 35%, #8b6ed4 100%)" }}
        >
          404
        </p>
        <h1 className="m-0 font-display text-[clamp(22px,3vw,28px)] font-semibold tracking-[-0.6px]">{t("title")}</h1>
        <p className="m-0 max-w-[440px] text-[15px] leading-[1.55] text-[#6e6e6b]">{t("body")}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href="/select" className={primaryClass}>
            {t("toDashboard")}
          </Link>
          <Link href="/select" className={secondaryClass}>
            {t("chooseCompany")}
          </Link>
        </div>
        <Link href="/kontakt" className="text-[13.5px] font-medium text-[#6e6e6b] no-underline hover:text-ink">
          {t("contactSupport")}
        </Link>
      </main>
      <footer className="relative flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 pb-6 text-[12.5px] text-[#6e6e6b]">
        <span>© {new Date().getFullYear()} Ployo</span>
        <span aria-hidden="true">·</span>
        <Link href="/impressum" className="text-[#6e6e6b] no-underline">
          {tFooter("imprint")}
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/datenschutz" className="text-[#6e6e6b] no-underline">
          {tFooter("privacy")}
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/agb" className="text-[#6e6e6b] no-underline">
          {tFooter("terms")}
        </Link>
      </footer>
    </div>
  );
}
