import CardHeader from "@/components/Card/CardHeader";
import RegisterForm from "@/components/auth/RegisterForm";

export const metadata = {
  title: "Registrieren",
};

export default function RegisterPage() {
  return (
    <>
      <CardHeader
        title="Konto erstellen"
        subtitle="Füllen Sie die Felder aus, um loszulegen."
      />
      <RegisterForm />
    </>
  );
}
