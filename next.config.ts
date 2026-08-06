import type { NextConfig } from "next";

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

export default nextConfig;
