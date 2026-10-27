import "@/app/(auth)/auth.css";
import AuthShell from "@/components/auth/AuthShell";
import CompanyCreateWizard from "@/components/CompanyCreate/CompanyCreateWizard";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Unternehmen erstellen",
};

export default async function CreateCompanyPage() {
  const t = await getTranslations("CreateCompanyPage");
  const tFooter = await getTranslations("Auth.footer");

  return (
    <AuthShell>
      <header className="relative z-[2] mx-auto box-border flex w-full max-w-[1200px] items-center justify-between gap-4 px-[clamp(16px,4vw,60px)] pt-6">
        <Link href="/" className="au-focus flex items-center gap-2 rounded-[9px] text-ink no-underline">
          <Image src="/logo_square_brand.svg" alt="" width={22} height={22} priority />
          <span className="font-display text-[18px] leading-none font-semibold tracking-[-0.4px]">Ployo</span>
        </Link>
        <Link href="/select" className="au-link au-focus rounded-[10px] px-3 py-2.5 text-[14px] font-medium text-muted-2 no-underline">
          {t("cancel")}
        </Link>
      </header>
      <main className="relative z-[1] box-border flex flex-1 justify-center px-4 pt-8 pb-8">
        <CompanyCreateWizard />
      </main>
      <footer className="relative z-[1] flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 pb-6 text-[12.5px] text-muted-2">
        <span>© {new Date().getFullYear()} Ployo</span>
        <span aria-hidden="true">·</span>
        <Link href="/impressum" className="au-text-link au-focus rounded text-muted-2 no-underline">
          {tFooter("imprint")}
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/datenschutz" className="au-text-link au-focus rounded text-muted-2 no-underline">
          {tFooter("privacy")}
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/agb" className="au-text-link au-focus rounded text-muted-2 no-underline">
          {tFooter("terms")}
        </Link>
      </footer>
    </AuthShell>
  );
}
