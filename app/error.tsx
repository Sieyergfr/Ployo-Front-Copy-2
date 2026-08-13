"use client";

import Link from "next/link";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

const knownMessages: Record<string, string> = {
  UNAUTHORIZED: "Bitte melden Sie sich an, um fortzufahren.",
  FORBIDDEN: "Sie haben keine Berechtigung für diese Aktion.",
};

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // Next.js catches error.tsx boundary errors before Sentry can; known
    // control-flow errors (auth/permission redirects) aren't real bugs.
    if (!(error.message in knownMessages)) {
      Sentry.captureException(error);
    }
  }, [error]);

  const message =
    knownMessages[error.message] ??
    "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.";

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-3xl font-semibold text-ink">Etwas ist schiefgelaufen</p>
      <p className="max-w-md text-sm text-muted">{message}</p>
      {error.digest && (
        <p className="font-mono text-[11px] text-muted">Fehler-ID: {error.digest}</p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Erneut versuchen
        </button>
        <Link href="/" className="btn btn-secondary">
          Zur Startseite
        </Link>
      </div>
    </div>
  );
}
