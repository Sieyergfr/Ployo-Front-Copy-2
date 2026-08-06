import CardHeader from "@/components/Card/CardHeader";
import RegisterForm from "@/components/auth/RegisterForm";
import { isEmailConfigured } from "@/lib/email";

export const metadata = {
  title: "Registrieren",
};

function sanitizeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;

  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : undefined;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = sanitizeNext((await searchParams).next);

  return (
    <>
      <CardHeader
        title="Konto erstellen"
        subtitle="Füllen Sie die Felder aus, um loszulegen."
      />
      <RegisterForm next={next} requiresEmailVerification={isEmailConfigured()} />
    </>
  );
}
