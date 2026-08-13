import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import CardHeader from "@/components/Card/CardHeader";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Passwort vergessen",
};

export default async function ForgotPasswordPage() {
  const t = await getTranslations("Auth.forgotPassword");

  return (
    <>
      <CardHeader title={t("title")} subtitle={t("subtitle")} />
      <ForgotPasswordForm />
    </>
  );
}
