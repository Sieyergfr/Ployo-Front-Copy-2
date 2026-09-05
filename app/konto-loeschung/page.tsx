import { cancelAccountDeletionAction } from "@/app/konto-loeschung/actions";
import ActionForm from "@/components/ActionForm";
import AccountDeletionRequestForm from "@/components/AccountDeletionRequestForm";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { ACCOUNT_DELETION_GRACE_DAYS, getOwnScheduledDeletion } from "@/lib/account-service";
import { auth } from "@/lib/auth";
import { ShieldAlert, Trash2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";

export const metadata = {
  title: "Konto löschen",
};

function daysUntil(target: Date) {
  return Math.max(0, Math.ceil((target.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

/**
 * Erreichbar ohne Anmeldung (Google-Play-Vorgabe: ein oeffentlicher,
 * funktionierender Link zur Kontoloeschung, unabhaengig davon, ob die App
 * noch installiert ist oder man sich anmelden kann). Ist man eingeloggt und
 * hat bereits eine vorgemerkte Loeschung laufen, zeigt dieselbe Route
 * stattdessen deren Status samt Abbrechen-Moeglichkeit.
 */
export default async function AccountDeletionPage() {
  const t = await getTranslations("AccountDeletionPage");
  const session = await auth.api.getSession({ headers: await headers() });
  const scheduledDeletionAt = session?.user?.id ? await getOwnScheduledDeletion() : null;

  if (scheduledDeletionAt) {
    const daysLeft = daysUntil(scheduledDeletionAt);
    const dateLabel = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(
      scheduledDeletionAt,
    );

    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <section className="w-full max-w-[440px] rounded-card border border-border bg-white px-7 py-9 text-center">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={30} />
          <h1 className="font-display text-[19px] font-semibold text-ink">
            {t("scheduledTitle")}
          </h1>
          <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted">
            {t.rich("scheduledBody", {
              date: dateLabel,
              daysSuffix: daysLeft > 0 ? t("daysLeftSuffix", { days: daysLeft }) : "",
              bold: (chunks) => <strong className="text-ink">{chunks}</strong>,
            })}
          </p>
          <ActionForm
            id="cancel-deletion-form"
            action={cancelAccountDeletionAction}
            className="mt-6"
          >
            <ConfirmSubmitButton
              form="cancel-deletion-form"
              className="btn btn-primary w-full"
              title={t("cancelDeletionTitle")}
              confirmLabel={t("cancelDeletionConfirm")}
              description={t("cancelDeletionDescription")}
            >
              {t("cancelDeletion")}
            </ConfirmSubmitButton>
          </ActionForm>
          <Link
            href="/logout"
            className="mt-4 inline-block text-[12.5px] font-medium text-muted underline underline-offset-2"
          >
            {t("signOut")}
          </Link>
          <p className="mt-5 text-[11px] text-muted-2">
            {t("graceNote", { days: ACCOUNT_DELETION_GRACE_DAYS })}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-[440px] items-center gap-2 px-6 py-8">
        <Image src="/logo_square_brand.svg" alt="Ployo Logo" width={22} height={22} />
        <span className="text-base font-semibold text-ink">Ployo</span>
      </header>
      <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-16">
        <section className="rounded-card border border-border bg-white px-7 py-8">
          <Trash2 className="mb-3 text-danger" size={26} />
          <h1 className="font-display text-[19px] font-semibold text-ink">
            {t("deleteAccountTitle")}
          </h1>
          <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted">
            {t("deleteAccountIntro")}
          </p>
          <p className="mt-2 text-[12.5px] leading-[1.6] text-muted-2">
            {t("deleteAccountNote")}
          </p>
          <div className="mt-6">
            <AccountDeletionRequestForm />
          </div>
        </section>
        <Link
          href="/login"
          className="mx-auto mt-6 text-[12.5px] font-medium text-muted underline underline-offset-2"
        >
          {t("backToLogin")}
        </Link>
      </main>
    </div>
  );
}
