import TwoFactorSettingsCard from "@/components/auth/TwoFactorSettingsCard";
import { getAccountOverview } from "@/lib/account-service";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Zwei-Faktor-Authentifizierung erforderlich",
};

export default async function TwoFactorRequiredPage({
  params,
}: PageProps<"/u/[tenant]/zwei-faktor-erforderlich">) {
  const { tenant } = await params;
  const account = await getAccountOverview();

  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-card border border-border bg-white px-6 py-14 text-center">
      <ShieldCheck className="text-muted" size={32} />
      <h1 className="font-display text-[19px] font-semibold text-ink">
        Zwei-Faktor-Authentifizierung erforderlich
      </h1>
      <p className="text-[13.5px] leading-[1.6] text-muted">
        Dieses Unternehmen verlangt für alle Mitglieder eine aktivierte
        Zwei-Faktor-Authentifizierung. Bitte richten Sie sie jetzt ein, um
        fortzufahren.
      </p>

      <div className="w-full text-left">
        <TwoFactorSettingsCard initialEnabled={account.twoFactorEnabled} />
      </div>

      {account.twoFactorEnabled && (
        <Link href={`/u/${tenant}`} className="btn btn-primary">
          Weiter zum Dashboard
        </Link>
      )}
    </section>
  );
}
