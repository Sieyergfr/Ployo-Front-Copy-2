import AuthBackLink from "@/components/auth/AuthBackLink";
import AuthShell from "@/components/auth/AuthShell";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import PageviewBeacon from "@/components/PageviewBeacon";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import "./auth.css";

export default async function AuthLayout ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
    const t = await getTranslations("Auth.footer");
    const tShell = await getTranslations("Auth.shell");

    return (
        <AuthShell>
            <PageviewBeacon />
            <header className="relative z-[2] mx-auto box-border flex w-full max-w-[1200px] items-center justify-between gap-4 px-[clamp(16px,4vw,60px)] pt-6">
                <Link
                    href="/"
                    aria-label={tShell("homeAria")}
                    className="au-focus flex items-center gap-2 rounded-[9px] text-ink no-underline"
                >
                    <Image src="/logo_square_brand.svg" alt="" width={22} height={22} priority />
                    <span className="font-display text-[18px] leading-none font-semibold tracking-[-0.4px]">
                        Ployo
                    </span>
                </Link>
                <AuthBackLink />
            </header>

            <main className="relative z-[1] box-border flex flex-1 items-center justify-center px-4 pt-10 pb-8">
                <div className="au-card box-border w-full max-w-[420px] rounded-card p-[clamp(24px,5vw,36px)] has-[[data-au-medium]]:max-w-[440px] has-[[data-au-wide]]:max-w-[460px]">
                    {children}
                </div>
            </main>

            <footer className="relative z-[1] flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 pb-6 text-[12.5px] text-muted-2">
                <span>© {new Date().getFullYear()} Ployo</span>
                <span aria-hidden="true">·</span>
                <Link href="/impressum" className="au-text-link au-focus rounded text-muted-2 no-underline">
                    {t("imprint")}
                </Link>
                <span aria-hidden="true">·</span>
                <Link href="/datenschutz" className="au-text-link au-focus rounded text-muted-2 no-underline">
                    {t("privacy")}
                </Link>
                <span aria-hidden="true">·</span>
                <Link href="/agb" className="au-text-link au-focus rounded text-muted-2 no-underline">
                    {t("terms")}
                </Link>
                <span aria-hidden="true">·</span>
                <LocaleSwitcher className="inline-flex items-center gap-1.5 align-middle" />
            </footer>
        </AuthShell>
    )
}
