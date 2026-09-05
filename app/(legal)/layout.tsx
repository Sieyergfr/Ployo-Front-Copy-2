import Image from "next/image";
import Link from "next/link";
import { CookieSettingsLink } from "@/components/CookieSettingsLink";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import PageviewBeacon from "@/components/PageviewBeacon";
import { getTranslations } from "next-intl/server";

export default async function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("LegalLayout");

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <PageviewBeacon />
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo_square_brand.svg" alt="Ployo Logo" width={24} height={24} />
          <span className="text-lg font-semibold text-ink">Ployo</span>
        </Link>
        <Link href="/login" className="btn btn-secondary">
          {t("signIn")}
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 min-h-0 overflow-y-auto px-6 py-8">
        {children}
      </main>
      <footer className="border-t border-border-soft">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-6 py-5 text-[12.5px] text-muted">
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
