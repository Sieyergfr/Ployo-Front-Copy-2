import { getTranslations } from "next-intl/server";
import Link from "next/link";

export const metadata = {
  title: "Seite nicht gefunden",
};

export default async function NotFound() {
  const t = await getTranslations("NotFound");

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <p className="text-3xl font-semibold text-ink">{t("title")}</p>
      <p className="max-w-md text-sm text-muted">
        {t("body")}
      </p>
      <Link href="/" className="btn btn-primary">
        {t("goHome")}
      </Link>
    </div>
  );
}
