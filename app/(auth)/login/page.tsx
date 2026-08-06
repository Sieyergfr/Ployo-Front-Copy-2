import CardHeader from "@/components/Card/CardHeader";
import LoginForm from "@/components/auth/LoginForm";

export const metadata = {
  title: "Login",
};

function sanitizeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;

  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : undefined;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = sanitizeNext((await searchParams).next);

  return (
    <>
      <CardHeader
        title="Willkommen zurück"
        subtitle="Bitte melden Sie sich mit Ihrem Konto an."
      />
      <LoginForm next={next} />
    </>
  );
}
