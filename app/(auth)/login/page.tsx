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
  searchParams: Promise<{ next?: string | string[]; accountDeletionScheduled?: string }>;
}) {
  const params = await searchParams;
  const next = sanitizeNext(params.next);

  return (
    <>
      <CardHeader
        title="Willkommen zurück"
        subtitle="Bitte melden Sie sich mit Ihrem Konto an."
      />
      {params.accountDeletionScheduled === "1" && (
        <p className="mb-4 rounded-[10px] border border-warning/25 bg-warning/10 px-3 py-2.5 text-[12.5px] text-[#7A4E00]">
          Ihr Konto wurde zur Löschung vorgemerkt und endgültig in 30 Tagen
          gelöscht. Melden Sie sich innerhalb dieser Frist erneut an, um die
          Löschung abzubrechen.
        </p>
      )}
      <LoginForm next={next} />
    </>
  );
}
