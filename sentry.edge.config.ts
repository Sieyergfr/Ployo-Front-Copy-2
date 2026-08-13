// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://e2f4fbf496779f6cae222c1cc2031f41@o4511899814920192.ingest.de.sentry.io/4511899820818512",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

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
