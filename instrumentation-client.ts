// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { parseConsentCookie } from "./lib/consent";

// Replay (Session-Aufzeichnung) und Performance-Tracing sind über §3 der
// Datenschutzerklärung an eine Einwilligung gekoppelt (Cookie-Consent-Banner,
// components/CookieConsent.tsx) und laufen ohne "granted"-Cookie nicht an.
// Basis-Fehlererfassung bleibt aktiv (berechtigtes Interesse, Betriebssicherheit).
const monitoringConsentGranted =
  typeof document !== "undefined" && parseConsentCookie(document.cookie) === "granted";

Sentry.init({
  dsn: "https://e2f4fbf496779f6cae222c1cc2031f41@o4511899814920192.ingest.de.sentry.io/4511899820818512",

  // Add optional integrations for additional features
  integrations: monitoringConsentGranted ? [Sentry.replayIntegration()] : [],

  // Define how likely traces are sampled. Ohne Einwilligung kein Performance-Tracing.
  tracesSampleRate: monitoringConsentGranted ? 1 : 0,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: monitoringConsentGranted ? 0.1 : 0,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: monitoringConsentGranted ? 1.0 : 0,

  // Restriktive Datensammlung: die App verarbeitet IBAN/Sozialversicherungsnummer/
  // Steuer-ID/Krankenkasse — SDK-Defaults (volle HTTP-Bodies, DB-Query-Werte,
  // Cookies, Stack-Frame-Variablen) würden das an Sentry senden.
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
