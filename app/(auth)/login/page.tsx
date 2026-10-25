import AuthCardHeader, { AuthLogoBadge } from "@/components/auth/AuthCardHeader";
import LoginForm from "@/components/auth/LoginForm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

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
  const t = await getTranslations("Auth.login");

  return (
    <>
      <AuthCardHeader badge={<AuthLogoBadge />} title={t("title")} subtitle={t("subtitle")} />
      {params.accountDeletionScheduled === "1" && (
        <p className="mt-5 rounded-[10px] border border-warning/25 bg-warning/10 px-3 py-2.5 text-[12.5px] text-[#7A4E00]">
          {t("accountDeletionScheduled")}
        </p>
      )}
      <LoginForm next={next} />
      <p className="mt-6 text-center text-[13.5px] text-muted-2">
        {t("noAccount")}{" "}
        <Link
          href="/register"
          className="au-text-link au-focus rounded font-semibold text-ink no-underline"
        >
          {t("startTrial")}
        </Link>
      </p>
    </>
  );
}
