import { AuthIconBadge } from "@/components/auth/AuthCardHeader";
import ResendVerificationButton from "@/components/auth/ResendVerificationButton";
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
    <div className="flex flex-col items-center py-2 text-center">
      <AuthIconBadge size="lg">
        <Mail size={28} strokeWidth={1.75} aria-hidden="true" />
      </AuthIconBadge>
      <h1 className="mt-6 font-display text-[26px] leading-[1.1] font-semibold tracking-[-0.8px] text-ink">
        {t("title")}
      </h1>
      <p className="mt-2.5 max-w-[340px] text-[14px] leading-[1.6] text-muted-2">
        {email
          ? t.rich("sentWithEmail", {
              email,
              strong: (chunks) => <strong className="font-semibold text-ink">{chunks}</strong>,
            })
          : t("sentWithoutEmail")}
      </p>
      <Link href="/login" className="btn btn-secondary au-focus mt-7 flex min-h-12 w-full no-underline">
        {t("backToLogin")}
      </Link>
      <p className="mt-[18px] text-[13px] text-muted-2">
        {t("noEmail")}{" "}
        {email ? <ResendVerificationButton email={email} /> : t("checkSpam")}
      </p>
    </div>
  );
}
