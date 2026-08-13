"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Next.js catches global-error.tsx boundary errors before Sentry can.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="de">
      <body
        style={{
          display: "flex",
          minHeight: "100svh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: "24px", fontWeight: 600 }}>
          Etwas ist schiefgelaufen
        </p>
        <p style={{ fontSize: "14px", color: "#6e6e6b", maxWidth: "420px" }}>
          Es ist ein unerwarteter Fehler aufgetreten. Bitte laden Sie die Seite
          neu.
        </p>
        {error.digest && (
          <p style={{ fontSize: "11px", color: "#6e6e6b", fontFamily: "monospace" }}>
            Fehler-ID: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "10px 18px",
            borderRadius: "10px",
            border: "none",
            background: "#2a6fdb",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Neu laden
        </button>
      </body>
    </html>
  );
}
