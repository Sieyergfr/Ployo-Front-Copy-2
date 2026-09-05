import ContactForm from "@/components/ContactForm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

export const metadata = {
  title: "Kontakt & Support",
  description: "Support kontaktieren oder eine Frage zu Ployo stellen.",
};

/**
 * Öffentliche Support-Seite. Beide App-Stores verlangen im Eintrag eine
 * erreichbare Support-URL — bis hierher zeigte der Footer-Link "Kontakt" auf
 * `#`, und `/kontakt` gab es gar nicht. Dieselbe Route ist damit auch das
 * Ziel, das in App Store Connect und Google Play als Support-URL steht.
 */
export default async function KontaktPage() {
  const t = await getTranslations("KontaktPage");

  return (
    <article className="flex flex-col gap-6 text-sm leading-7 text-ink">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">
          {t("intro")}
        </p>
      </div>

      <section className="rounded-card border border-border bg-white px-6 py-6">
        <ContactForm />
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t("directContactTitle")}</h2>
        <p>
          {t("emailLabel")}{" "}
          <a href="mailto:info@ployo.io" className="underline underline-offset-2">
            info@ployo.io
          </a>
          <br />
          {t.rich("addressHint", {
            link: (chunks) => (
              <Link href="/impressum" className="underline underline-offset-2">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t("accountAndDataTitle")}</h2>
        <p>
          {t.rich("accountAndDataText", {
            deleteLink: (chunks) => (
              <Link href="/konto-loeschung" className="underline underline-offset-2">
                {chunks}
              </Link>
            ),
            privacyLink: (chunks) => (
              <Link href="/datenschutz" className="underline underline-offset-2">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t("employeeQuestionTitle")}</h2>
        <p className="text-muted">
          {t("employeeQuestionText")}
        </p>
      </section>
    </article>
  );
}
