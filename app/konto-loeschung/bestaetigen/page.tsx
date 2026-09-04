import AccountDeletionConfirmForm from "@/components/AccountDeletionConfirmForm";
import { peekAccountDeletionToken } from "@/lib/account-service";
import { ShieldAlert, Trash2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Konto löschen bestätigen",
};

export default async function AccountDeletionConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("AccountDeletionConfirmPage");
  const { token } = await searchParams;
  const isValid = token ? await peekAccountDeletionToken(token) : false;

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-[440px] items-center gap-2 px-6 py-8">
        <Image src="/logo_square_brand.svg" alt="Ployo Logo" width={22} height={22} />
        <span className="text-base font-semibold text-ink">Ployo</span>
      </header>
      <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-16">
        <section className="rounded-card border border-border bg-white px-7 py-8">
          {!token || !isValid ? (
            <>
              <ShieldAlert className="mb-3 text-danger" size={26} />
              <h1 className="font-display text-[19px] font-semibold text-ink">
                {t("invalidLinkTitle")}
              </h1>
              <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted">
                {t("invalidLinkBody")}
              </p>
              <Link href="/konto-loeschung" className="btn btn-secondary mt-6 w-full">
                {t("requestAgain")}
              </Link>
            </>
          ) : (
            <>
              <Trash2 className="mb-3 text-danger" size={26} />
              <h1 className="font-display text-[19px] font-semibold text-ink">
                {t("confirmDeleteTitle")}
              </h1>
              <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted">
                {t("confirmDeleteBody")}
              </p>
              <p className="mt-2 text-[12.5px] leading-[1.6] text-muted-2">
                {t("confirmDeleteNote")}
              </p>
              <div className="mt-6">
                <AccountDeletionConfirmForm token={token} />
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
