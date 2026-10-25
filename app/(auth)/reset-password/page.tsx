import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { Suspense } from "react";

export const metadata = {
  title: "Passwort zurücksetzen",
};

export default function ResetPasswordPage() {
  // Kopf, Schrittanzeige und Erfolgszustand liegen im Client-Formular.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
