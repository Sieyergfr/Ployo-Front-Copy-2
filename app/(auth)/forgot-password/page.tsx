import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata = {
  title: "Passwort vergessen",
};

export default function ForgotPasswordPage() {
  // Kopf und Schrittanzeige wechseln nach dem Absenden und liegen deshalb im
  // Client-Formular.
  return <ForgotPasswordForm />;
}
