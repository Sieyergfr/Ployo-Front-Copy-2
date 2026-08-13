import { cancelAccountDeletionAction } from "@/app/konto-loeschung/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { ACCOUNT_DELETION_GRACE_DAYS, getOwnScheduledDeletion } from "@/lib/account-service";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Löschung vorgemerkt",
};

function daysUntil(target: Date) {
  return Math.max(0, Math.ceil((target.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default async function AccountDeletionPendingPage() {
  const scheduledDeletionAt = await getOwnScheduledDeletion();

  if (!scheduledDeletionAt) {
    redirect("/select");
  }

  const daysLeft = daysUntil(scheduledDeletionAt);
  const dateLabel = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(
    scheduledDeletionAt,
  );

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <section className="w-full max-w-[440px] rounded-card border border-border bg-white px-7 py-9 text-center">
        <ShieldAlert className="mx-auto mb-3 text-danger" size={30} />
        <h1 className="font-display text-[19px] font-semibold text-ink">
          Löschung Ihres Kontos vorgemerkt
        </h1>
        <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted">
          Ihr Konto ist zur Löschung vorgemerkt und wird am{" "}
          <strong className="text-ink">{dateLabel}</strong> endgültig gelöscht
          {daysLeft > 0 && ` (noch ${daysLeft} Tage)`}. Bis dahin können Sie
          die Löschung abbrechen und Ihr Konto wieder normal nutzen.
        </p>
        <form
          id="cancel-deletion-form"
          action={cancelAccountDeletionAction}
          className="mt-6"
        >
          <ConfirmSubmitButton
            form="cancel-deletion-form"
            className="btn btn-primary w-full"
            title="Löschung abbrechen?"
            confirmLabel="Ja, Löschung abbrechen"
            description="Ihr Konto wird reaktiviert und die geplante Löschung entfällt."
          >
            Löschung abbrechen
          </ConfirmSubmitButton>
        </form>
        <Link
          href="/logout"
          className="mt-4 inline-block text-[12.5px] font-medium text-muted underline underline-offset-2"
        >
          Abmelden
        </Link>
        <p className="mt-5 text-[11px] text-muted-2">
          Schutzfrist: {ACCOUNT_DELETION_GRACE_DAYS} Tage ab Anfrage.
        </p>
      </section>
    </div>
  );
}
