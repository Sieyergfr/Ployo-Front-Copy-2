import Image from "next/image";
import Link from "next/link";
import { CookieSettingsLink } from "@/components/CookieSettingsLink";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo_square_brand.svg" alt="Ployo Logo" width={24} height={24} />
          <span className="text-lg font-semibold text-ink">Ployo</span>
        </Link>
        <Link href="/login" className="btn btn-secondary">
          Anmelden
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        {children}
      </main>
      <footer className="border-t border-border-soft">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-6 py-5 text-[12.5px] text-muted">
          <span>© {new Date().getFullYear()} Ployo</span>
          <nav className="flex gap-4">
            <Link href="/datenschutz" className="hover:text-ink">
              Datenschutz
            </Link>
            <Link href="/impressum" className="hover:text-ink">
              Impressum
            </Link>
            <Link href="/agb" className="hover:text-ink">
              AGB
            </Link>
            <CookieSettingsLink className="cursor-pointer hover:text-ink" />
          </nav>
          <LocaleSwitcher />
        </div>
      </footer>
    </div>
  );
}
