"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Nur Key-Namen, keine übersetzten Texte: bleibt modul-weit stabil, damit
// der Effekt unten nicht bei jedem Render (t ändert sich nie zur Laufzeit,
// aber ein neu erzeugtes Objekt schon) erneut abhängig davon ist.
const knownMessageKeys: Record<string, string> = {
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
};

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("ErrorPage");

  useEffect(() => {
    console.error(error);
    // Next.js catches error.tsx boundary errors before Sentry can; known
    // control-flow errors (auth/permission redirects) aren't real bugs.
    if (!(error.message in knownMessageKeys)) {
      Sentry.captureException(error);
    }
  }, [error]);

  const message = knownMessageKeys[error.message]
    ? t(knownMessageKeys[error.message])
    : t("unexpectedError");

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-3xl font-semibold text-ink">{t("somethingWrong")}</p>
      <p className="max-w-md text-sm text-muted">{message}</p>
      {error.digest && (
        <p className="font-mono text-[11px] text-muted">{t("errorId", { digest: error.digest })}</p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          {t("tryAgain")}
        </button>
        <Link href="/" className="btn btn-secondary">
          {t("goHome")}
        </Link>
      </div>
    </div>
  );
}
