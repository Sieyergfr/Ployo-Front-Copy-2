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
  if (!hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;

    if (target && target !== "/") {
      loginUrl.searchParams.set("next", target);
    }

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
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
