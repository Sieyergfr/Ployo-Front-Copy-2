import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import CardHeader from "@/components/Card/CardHeader";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

export const metadata = {
  title: "Passwort zurücksetzen",
};

export default async function ResetPasswordPage() {
  const t = await getTranslations("Auth.resetPassword");

  return (
    <>
      <CardHeader title={t("title")} subtitle={t("subtitle")} />
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
