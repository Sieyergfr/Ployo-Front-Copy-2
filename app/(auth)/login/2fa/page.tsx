import CardHeader from "@/components/Card/CardHeader";
import TwoFactorVerifyForm from "@/components/auth/TwoFactorVerifyForm";

export const metadata = {
  title: "Zwei-Faktor-Bestätigung",
};

function sanitizeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;

  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : undefined;
}

export default async function TwoFactorVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = sanitizeNext((await searchParams).next);

  return (
    <>
      <CardHeader
        title="Zwei-Faktor-Bestätigung"
        subtitle="Bitte geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein."
      />
      <TwoFactorVerifyForm next={next} />
    </>
  );
}
