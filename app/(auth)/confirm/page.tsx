import { SecondaryButton } from "@/components/Buttons/PrimaryButton";
import Divider from "@/components/Divider";
import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("Auth.confirm");

  return (
    <>
      <div className="flex items-center justify-center">
        <div className="floating-circle animate-float">
          <Mail size={32} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <p className="card-heading text-center">{t("title")}</p>
        <div className="flex flex-col items-center gap-1.5">
          <p className="description text-center">{t("sentToPrefix")}</p>
          {email && (
            <div className="pill mt-2">
              <Mail size={12} strokeWidth={2} color="#6E6E6B" />
              <span className="pill-label">{email}</span>
            </div>
          )}
          <p className="description text-center">
            {email ? t("sentWithEmailSuffix") : t("sentWithoutEmail")}{" "}
            {t("instructions")}
          </p>
        </div>
      </div>
      <Divider />
      <div className="flex flex-col gap-2">
        <p className="text-muted text-center text-xs">{t("noEmailHint")}</p>
        <Link href="/login" className="contents">
          <SecondaryButton>
            <p>{t("backToLogin")}</p>
          </SecondaryButton>
        </Link>
      </div>
    </>
  );
}
