import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import CardHeader from "@/components/Card/CardHeader";

export const metadata = {
  title: "Passwort vergessen",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <CardHeader
        title="Passwort vergessen"
        subtitle="Geben Sie Ihre E-Mail ein, um einen Reset-Link anzufordern."
      />
      <ForgotPasswordForm />
    </>
  );
}
