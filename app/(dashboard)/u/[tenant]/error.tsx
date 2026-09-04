"use client";

import NoAccessNotice from "@/components/NoAccessNotice";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Segment-Error-Boundary für /u/[tenant]/* — fängt FORBIDDEN aus
 * requireTenantAccess ab und zeigt statt der generischen Fehlerseite eine
 * hilfreiche "Kein Zugriff"-Ansicht mit Link zum Self-Service-Bereich.
 */
export default function TenantErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("TenantErrorBoundary");
  const pathname = usePathname();
  const tenant = pathname?.split("/")[2] ?? "";

  useEffect(() => {
    console.error(error);
    // Next.js catches error.tsx boundary errors before Sentry can; FORBIDDEN
    // is an expected access-denied path here, not a real bug.
    if (error.message !== "FORBIDDEN") {
      Sentry.captureException(error);
    }
  }, [error]);

  if (error.message === "FORBIDDEN" && tenant) {
    return <NoAccessNotice tenant={tenant} />;
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-2xl font-semibold text-ink">{t("somethingWrong")}</p>
      <p className="max-w-md text-sm text-muted">
        {t("unexpectedError")}
      </p>
      {error.digest && (
        <p className="font-mono text-[11px] text-muted">{t("errorId", { digest: error.digest })}</p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          {t("tryAgain")}
        </button>
        {tenant && (
          <Link href={`/u/${tenant}`} className="btn btn-secondary">
            {t("goToOverview")}
          </Link>
        )}
      </div>
    </div>
  );
}
