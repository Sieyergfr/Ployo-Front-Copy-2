import CardHeader from "@/components/Card/CardHeader";
import LoginForm from "@/components/auth/LoginForm";

export const metadata = {
  title: "Login",
};

export default function LoginPage() {
  return (
    <>
      <CardHeader
        title="Willkommen zurück"
        subtitle="Bitte melden Sie sich mit Ihrem Konto an."
      />
      <LoginForm />
    </>
  );
}
