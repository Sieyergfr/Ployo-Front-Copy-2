import CardHeader from "@/components/Card/CardHeader";
import TwoFactorVerifyForm from "@/components/auth/TwoFactorVerifyForm";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Zwei-Faktor-Bestätigung",
};

function sanitizeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;

  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : undefined;
}

export default async function TwoFactorVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = sanitizeNext((await searchParams).next);
  const t = await getTranslations("Auth.twoFactor");

  return (
    <>
      <CardHeader title={t("title")} subtitle={t("subtitle")} />
      <TwoFactorVerifyForm next={next} />
    </>
  );
}
