import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import CardHeader from "@/components/Card/CardHeader";
import { Suspense } from "react";

export const metadata = {
  title: "Passwort zurücksetzen",
};

export default function ResetPasswordPage() {
  return (
    <>
      <CardHeader
        title="Passwort zurücksetzen"
        subtitle="Legen Sie ein neues Passwort für Ihr Konto fest."
      />
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
