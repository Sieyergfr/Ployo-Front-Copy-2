import { SecondaryButton } from "@/components/Buttons/PrimaryButton";
import Divider from "@/components/Divider";
import Link from "next/link";
import { Mail } from "lucide-react";

export const metadata = {
  title: "E-Mail bestätigen",
};

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const emailParam = (await searchParams).email;
  const email = Array.isArray(emailParam) ? emailParam[0] : emailParam;

  return (
    <>
      <div className="flex items-center justify-center">
        <div className="floating-circle animate-float">
          <Mail size={32} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <p className="card-heading text-center">E-Mail bestätigen</p>
        <div className="flex flex-col items-center gap-1.5">
          <p className="description text-center">
            Wir haben einen Bestätigungslink an
          </p>
          {email && (
            <div className="pill mt-2">
              <Mail size={12} strokeWidth={2} color="#6E6E6B" />
              <span className="pill-label">{email}</span>
            </div>
          )}
          <p className="description text-center">
            {email ? "gesendet." : "Ihre E-Mail-Adresse gesendet."} Bitte
            prüfen Sie Ihr Postfach und klicken Sie auf den Link, um Ihr Konto
            zu aktivieren.
          </p>
        </div>
      </div>
      <Divider />
      <div className="flex flex-col gap-2">
        <p className="text-muted text-center text-xs">
          Keine E-Mail erhalten? Prüfen Sie auch Ihren Spam-Ordner oder melden
          Sie sich erneut an, um einen neuen Link zu erhalten.
        </p>
        <Link href="/login" className="contents">
          <SecondaryButton>
            <p>Zur Anmeldung</p>
          </SecondaryButton>
        </Link>
      </div>
    </>
  );
}
