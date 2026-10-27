import Image from "next/image";
import Link from "next/link";
import { CookieSettingsLink } from "@/components/CookieSettingsLink";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import LegalNav from "@/components/legal/LegalNav";
import PageviewBeacon from "@/components/PageviewBeacon";
import { getTranslations } from "next-intl/server";

export default async function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("LegalLayout");

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-[#fafaf8]">
      <PageviewBeacon />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[-200px] left-1/2 size-[1100px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(167,142,232,0.16) 0%, transparent 65%)" }}
      />
      <header className="relative mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 text-ink no-underline">
          <Image src="/logo_square_brand.svg" alt="Ployo Logo" width={22} height={22} />
          <span className="font-display text-[18px] leading-none font-semibold tracking-[-0.4px]">Ployo</span>
        </Link>
        <Link href="/login" className="rounded-[9px] px-3 py-2 text-[14px] font-medium text-[#6e6e6b] no-underline hover:text-ink">
          {t("signIn")}
        </Link>
      </header>
      <main className="relative mx-auto grid w-full max-w-[1036px] flex-1 items-start gap-6 px-6 pt-6 pb-12 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 lg:sticky lg:top-6">
          <span className="px-3 font-mono text-[10.5px] tracking-[0.12em] text-[#6e6e6b] uppercase">{t("eyebrow")}</span>
          <LegalNav
            labels={{ imprint: t("imprint"), dataProtection: t("dataProtection"), terms: t("terms"), contact: t("contact") }}
            backLabel={t("back")}
          />
        </div>
        <div className="min-w-0 rounded-[18px] border border-[#ecebe7] bg-white px-[clamp(20px,4vw,40px)] py-[clamp(24px,4vw,36px)] shadow-[0_20px_60px_-30px_rgba(139,110,212,0.35)] [&_h1]:font-display [&_h1]:text-[clamp(28px,4vw,38px)] [&_h1]:tracking-[-1px] [&_h2]:font-display [&_h2]:text-[18px] [&_h2]:tracking-[-0.3px]">
          {children}
        </div>
      </main>
      <footer className="relative border-t border-border-soft">
        <div className="mx-auto flex w-full max-w-[1036px] flex-wrap items-center justify-between gap-2 px-6 py-5 text-[12.5px] text-muted">
          <span>© {new Date().getFullYear()} Ployo</span>
          <nav className="flex flex-wrap gap-4">
            <Link href="/datenschutz" className="hover:text-ink">
              {t("dataProtection")}
            </Link>
            <Link href="/impressum" className="hover:text-ink">
              {t("imprint")}
            </Link>
            <Link href="/kontakt" className="hover:text-ink">
              {t("contact")}
            </Link>
            <Link href="/agb" className="hover:text-ink">
              {t("terms")}
            </Link>
            <Link href="/konto-loeschung" className="hover:text-ink">
              {t("deleteAccount")}
            </Link>
            <CookieSettingsLink className="cursor-pointer hover:text-ink" />
          </nav>
          <LocaleSwitcher />
        </div>
      </footer>
    </div>
  );
}
