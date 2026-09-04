import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy wird nicht mehr hier gesetzt, sondern dynamisch pro
// Request in proxy.ts (Nonce-basiert statt 'unsafe-inline' in script-src) —
// ein statischer Header kann keinen Nonce tragen.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  /**
   * Standardmäßig `.next`. Über `NEXT_BUILD_DIR` lässt sich ein Probe-Build in
   * ein anderes Verzeichnis lenken — nötig, um Änderungen zu verifizieren,
   * ohne den Build-Cache des laufenden `next start` anzufassen (der hält
   * Dateien in `.next/build` offen).
   */
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  poweredByHeader: false,
  allowedDevOrigins:
    process.env.DEV_LAN_HOSTS?.split(",")
      .map((host) => host.trim())
      .filter(Boolean) ?? [],
  devIndicators: {
    position: "top-right",
  },
  experimental: {
    serverActions: {
      // Datei-Uploads laufen über Server Actions; fachliches Limit (15 MB)
      // wird zusätzlich in lib/storage/storage.service.ts geprüft.
      bodySizeLimit: "20mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withSentryConfig(withNextIntl(nextConfig), {
 // For all available options, see:
 // https://www.npmjs.com/package/@sentry/webpack-plugin#options

 org: "ployo",

 project: "javascript-nextjs",

 // Only print logs for uploading source maps in CI
 silent: !process.env.CI,

 // For all available options, see:
 // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

 // Upload a larger set of source maps for prettier stack traces (increases build time)
 widenClientFileUpload: true,

 // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
 // This can increase your server load as well as your hosting bill.
 // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
 // side errors will fail.
 tunnelRoute: "/monitoring",

 webpack: {
   // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
   // See the following for more information:
   // https://docs.sentry.io/product/crons/
   // https://vercel.com/docs/cron-jobs
   automaticVercelMonitors: true,

   // Tree-shaking options for reducing bundle size
   treeshake: {
     // Automatically tree-shake Sentry logger statements to reduce bundle size
     removeDebugLogging: true,
   },
 },
});
