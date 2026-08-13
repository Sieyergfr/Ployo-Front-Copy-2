"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CONSENT_COOKIE, CONSENT_MAX_AGE_DAYS } from "@/lib/consent";

const REOPEN_EVENT = "ployo:open-cookie-settings";

function hasConsentCookie() {
  return document.cookie
    .split("; ")
    .some((entry) => entry.startsWith(`${CONSENT_COOKIE}=`));
}

// Modul-weiter Mini-Store statt useState/useEffect: der sichtbare Zustand
// hängt von einer Browser-only-Quelle (Cookie) ab, die auf dem Server nicht
// existiert. useSyncExternalStore ist dafür das dafür vorgesehene Werkzeug —
// es vermeidet sowohl Hydration-Mismatches als auch synchrones setState in
// einem Effect.
let forcedOpen = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  function handleReopen() {
    forcedOpen = true;
    notify();
  }

  window.addEventListener(REOPEN_EVENT, handleReopen);
  return () => {
    listeners.delete(listener);
    window.removeEventListener(REOPEN_EVENT, handleReopen);
  };
}

function getSnapshot() {
  return forcedOpen || !hasConsentCookie();
}

function getServerSnapshot() {
  return false;
}

function decide(value: "granted" | "denied") {
  forcedOpen = false;
  const maxAge = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;

  if (value === "granted") {
    window.location.reload();
    return;
  }

  notify();
}

export function CookieConsent() {
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie-Einstellungen"
      className="fixed inset-x-0 bottom-0 z-[1700] flex justify-center px-3 pb-3 md:px-4 md:pb-4"
    >
      <div className="flex w-full max-w-[560px] flex-col gap-3 rounded-card border border-border bg-white p-4 shadow-[0_14px_42px_rgba(0,0,0,0.14)] md:p-5">
        <p className="text-[13.5px] leading-6 text-ink">
          Wir verwenden technisch notwendige Cookies für Anmeldung und
          Sitzung. Mit Ihrer Einwilligung setzen wir zusätzlich
          Fehler- und Performance-Monitoring (Sentry) ein, das dabei auch
          Session-Aufzeichnungen bei Fehlern anfertigen kann, um Probleme in
          der Anwendung zu erkennen und zu beheben. Mehr dazu in unserer{" "}
          <Link href="/datenschutz" className="underline underline-offset-2">
            Datenschutzerklärung
          </Link>
          .
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => decide("denied")}
          >
            Nur notwendige
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => decide("granted")}
          >
            Alle akzeptieren
          </button>
        </div>
      </div>
    </div>
  );
}
