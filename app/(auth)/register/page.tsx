import CardHeader from "@/components/Card/CardHeader";
import RegisterForm from "@/components/auth/RegisterForm";
import { isEmailConfigured } from "@/lib/email";
import { getTranslations } from "next-intl/server";

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
      <CardHeader title={t("title")} subtitle={t("subtitle")} />
      <RegisterForm next={next} requiresEmailVerification={isEmailConfigured()} />
    </>
  );
}
