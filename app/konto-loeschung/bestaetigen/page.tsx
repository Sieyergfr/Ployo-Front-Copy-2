import AccountDeletionConfirmForm from "@/components/AccountDeletionConfirmForm";
import { peekAccountDeletionToken } from "@/lib/account-service";
import { ShieldAlert, Trash2 } from "lucide-react";
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
                Link ungültig oder abgelaufen
              </h1>
              <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted">
                Dieser Bestätigungslink ist nicht mehr gültig (nach 15 Minuten
                oder einmaliger Nutzung). Bitte die Löschung erneut anfordern.
              </p>
              <Link href="/konto-loeschung" className="btn btn-secondary mt-6 w-full">
                Löschung erneut anfordern
              </Link>
            </>
          ) : (
            <>
              <Trash2 className="mb-3 text-danger" size={26} />
              <h1 className="font-display text-[19px] font-semibold text-ink">
                Konto endgültig löschen?
              </h1>
              <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted">
                Mit Bestätigung werden Ihre Zugangsdaten, aktive Sitzungen,
                Social-Login-Verknüpfungen (Apple/Google) und Push-Token
                sofort und unwiderruflich gelöscht. Diese Aktion kann nicht
                rückgängig gemacht werden.
              </p>
              <p className="mt-2 text-[12.5px] leading-[1.6] text-muted-2">
                Personal-, Beschäftigungs- und Gehaltsdaten, die Ihr
                Arbeitgeber gesetzlich aufbewahren muss, bleiben davon
                unberührt.
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
