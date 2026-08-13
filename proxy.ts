import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistischer Auth-Check (Next 16 „Proxy“, ehemals Middleware):
 * leitet nicht angemeldete Besucher geschützter Bereiche zum Login um.
 * Die eigentliche Autorisierung passiert weiterhin serverseitig in der
 * Data-Access-Schicht (lib/tenant-access.ts) – dies hier ist nur UX-Schutz.
 */

const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

function hasSessionCookie(request: NextRequest) {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
}

export function proxy(request: NextRequest) {
  // Request-ID für die Log-Korrelation (lib/logger.ts) — vom Reverse Proxy
  // übernehmen, falls schon gesetzt, sonst hier erzeugen. Wird sowohl an
  // den Server (Request-Header) als auch an den Client (Response-Header)
  // weitergereicht.
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  if (!hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;

    if (target && target !== "/") {
      loginUrl.searchParams.set("next", target);
    }

    const response = NextResponse.redirect(loginUrl);
    response.headers.set("x-request-id", requestId);

    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);

  return response;
}

export const config = {
  matcher: [
    "/u/:path*",
    "/select",
    "/select/:path*",
    "/erinnerungen",
    "/konto",
  ],
};
