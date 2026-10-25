import AuthCardHeader, { AuthPill } from "@/components/auth/AuthCardHeader";
import RegisterForm from "@/components/auth/RegisterForm";
import { isEmailConfigured } from "@/lib/email";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

export const metadata = {
  title: "Registrieren",
};

function sanitizeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;

  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : undefined;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = sanitizeNext((await searchParams).next);
  const t = await getTranslations("Auth.register");

  return (
    <>
      <AuthCardHeader
        pill={<AuthPill>{t("trialPill")}</AuthPill>}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <RegisterForm next={next} requiresEmailVerification={isEmailConfigured()} />
      <p className="mt-[22px] text-center text-[13.5px] text-muted-2">
        {t("haveAccount")}{" "}
        <Link
          href="/login"
          className="au-text-link au-focus rounded font-semibold text-ink no-underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </>
  );
}
