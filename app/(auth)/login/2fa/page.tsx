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

  // Der Kopf (Titel/Icon) wechselt mit dem Modus App-Code/Backup-Code und
  // liegt deshalb im Client-Formular.
  return <TwoFactorVerifyForm next={next} />;
}
