"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { CONSENT_BANNER_VERSION, CONSENT_COOKIE, CONSENT_MAX_AGE_DAYS } from "@/lib/consent";

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

function recordConsent(value: "granted" | "denied") {
  // keepalive: die Anfrage muss den unmittelbar folgenden reload() (bei
  // beiden Werten, siehe decide()) überleben, statt vom Navigations-Abbruch
  // gekillt zu werden.
  fetch("/api/consent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value, bannerVersion: CONSENT_BANNER_VERSION }),
    keepalive: true,
  }).catch(() => {
    // Nachweis-Protokollierung ist best-effort; ein Netzwerkfehler soll die
    // eigentliche Consent-Entscheidung des Nutzers nicht blockieren.
  });
}

function decide(value: "granted" | "denied") {
  forcedOpen = false;
  const maxAge = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
  recordConsent(value);

  // Ein Neuladen ist bei "granted" ohnehin nötig, damit Sentry Replay/Tracing
  // erst jetzt aktiviert wird (instrumentation-client.ts liest den Consent
  // nur beim Modul-Init). Bei "denied" war das bisher asymmetrisch: ein
  // zuvor schon aktiviertes Replay lief bis zur nächsten Navigation einfach
  // weiter (Audit-Finding M10) — deshalb auch hier neu laden, statt nur das
  // Banner auszublenden. `instrumentation-client.ts` startet dann ohne
  // Replay-Integration neu.
  window.location.reload();
}

export function CookieConsent() {
  const t = useTranslations("CookieConsent");
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("settingsAria")}
      className="fixed inset-x-0 bottom-0 z-[1700] flex justify-center px-3 pb-3 md:px-4 md:pb-4"
    >
      <div className="flex w-full max-w-[560px] flex-col gap-3 rounded-card border border-border bg-white p-4 shadow-[0_14px_42px_rgba(0,0,0,0.14)] md:p-5">
        <p className="text-[13.5px] leading-6 text-ink">
          {t.rich("bannerText", {
            link: (chunks) => (
              <Link href="/datenschutz" className="underline underline-offset-2">
                {chunks}
              </Link>
            ),
          })}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => decide("denied")}
          >
            {t("onlyNecessary")}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => decide("granted")}
          >
            {t("acceptAll")}
          </button>
        </div>
      </div>
    </div>
  );
}
