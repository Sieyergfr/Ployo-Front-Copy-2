"use client";

import NoAccessNotice from "@/components/NoAccessNotice";
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
      <p className="text-2xl font-semibold text-ink">Etwas ist schiefgelaufen</p>
      <p className="max-w-md text-sm text-muted">
        Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es
        erneut.
      </p>
      {error.digest && (
        <p className="font-mono text-[11px] text-muted">Fehler-ID: {error.digest}</p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Erneut versuchen
        </button>
        {tenant && (
          <Link href={`/u/${tenant}`} className="btn btn-secondary">
            Zur Übersicht
          </Link>
        )}
      </div>
    </div>
  );
}
