import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isDev = process.env.NODE_ENV === "development";

/**
 * Für Downloads werden signierte URLs des konfigurierten S3-Endpoints
 * geladen. Nur dieser Host wird in der CSP freigegeben; ohne Konfiguration
 * bleibt es bei 'self'.
 */
function storageOrigin() {
  const endpoint = process.env.STORAGE_S3_ENDPOINT;

  if (!endpoint) {
    return "";
  }

  try {
    return new URL(
      endpoint.startsWith("http") ? endpoint : `https://${endpoint}`,
    ).origin;
  } catch {
    return "";
  }
}

const storageHost = storageOrigin();
const storageSource = storageHost ? ` ${storageHost}` : "";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js benötigt Inline-Skripte für die Hydration; in Dev zusätzlich eval.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data:${storageSource}`,
  "font-src 'self'",
  // ws: für Dev-HMR.
  `connect-src 'self'${storageSource}${isDev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
