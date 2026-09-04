import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Zwei unabhängige Aufgaben in einer Funktion, weil Next 16 pro App nur
 * einen "Proxy" (ehemals Middleware) erlaubt:
 *
 * 1. Optimistischer Auth-Check: leitet nicht angemeldete Besucher
 *    geschützter Bereiche zum Login um. Die eigentliche Autorisierung
 *    passiert weiterhin serverseitig in der Data-Access-Schicht
 *    (lib/tenant-access.ts) – dies hier ist nur UX-Schutz.
 * 2. Content-Security-Policy mit Nonce statt 'unsafe-inline' in script-src
 *    (siehe `buildContentSecurityPolicy`) — dafür läuft der Proxy jetzt auf
 *    praktisch jeder Seite, nicht nur den geschützten Bereichen (siehe
 *    `config.matcher` unten), ein statischer Header (vorher in
 *    next.config.ts) kann keinen Nonce tragen.
 */

const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

function hasSessionCookie(request: NextRequest) {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
}

// Deckt sich mit dem bisherigen (engeren) Proxy-Matcher — der Matcher selbst
// ist jetzt breit (für die CSP), der Login-Redirect bleibt aber weiterhin nur
// für diese Bereiche aktiv.
const PROTECTED_PATH_PATTERNS = [
  /^\/u(\/|$)/,
  /^\/select(\/|$)/,
  /^\/erinnerungen$/,
  /^\/konto$/,
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

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

/**
 * script-src trägt jetzt einen Nonce + 'strict-dynamic' statt 'unsafe-inline'
 * — das war der kritischste ungeschlossene Punkt aus dem Sicherheitsaudit
 * (Teil 2.4): 'unsafe-inline' nimmt der CSP praktisch ihre gesamte Wirkung
 * als XSS-Rückfallebene.
 *
 * style-src behält bewusst 'unsafe-inline'. Ein Umbau-Versuch (2026-09-03)
 * hat alle bis dahin verbliebenen `style={{...}}`-Stellen angefasst:
 * - Statische/kleine feste Wertemengen (z. B. `alignItems`, Auth-Layout-
 *   Breite, die Landingpage-Farben/-Animationen) sind jetzt echte,
 *   zur Build-Zeit bekannte Tailwind-/CSS-Klassen — kein `style=""` mehr,
 *   diese Stellen tragen also nicht mehr zum `unsafe-inline`-Bedarf bei.
 * - Für echte Laufzeit-Werte (Dropdown-Positionen aus `getBoundingClientRect`
 *   in EmployeeSelector/TeamEditControls/ShiftPlanningClient, Drag-Position
 *   in Toasts, frei wählbare Hex-Farbe in CompanyCreateWizard, dynamische
 *   `grid-template-columns` in DataTable, diverse Prozent-Balken) wurde
 *   `style={{ '--x': wert }}` + eine Klasse mit `var(--x)` versucht — das
 *   sieht nach einer Lösung aus, ist es aber NICHT: mit Playwright/Chromium
 *   gegen eine testweise verschärfte Policy verifiziert, blockt
 *   `style-src` ohne 'unsafe-inline' jedes `style=""`-Attribut vollständig,
 *   auch wenn es nur eine CSS-Custom-Property setzt (kein Sonderfall dafür
 *   in der Spec) — die Elemente fallen dann sichtbar auf ihren
 *   Default-Wert zurück (z. B. Balken auf 100% statt auf den echten
 *   Prozentwert, Dropdown auf Position 0/0). 'unsafe-inline' deshalb NICHT
 *   entfernt. Ein echter Fix bräuchte nonce-basierte, zur Laufzeit
 *   injizierte `<style>`-Tags statt des `style`-Attributs — ein eigenes,
 *   spürbar größeres Projekt, das über reines Klassen-Umschreiben
 *   hinausgeht. script-src (Nonce + 'strict-dynamic') ist ohnehin der
 *   eigentliche XSS-Ausführungsweg und trägt den Sicherheitsgewinn; das
 *   CSS-Injection-Restrisiko von `style-src 'unsafe-inline'` bleibt gering,
 *   da darüber kein Code ausführbar ist.
 */
function buildContentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  const storageHost = storageOrigin();
  const storageSource = storageHost ? ` ${storageHost}` : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${storageSource}`,
    "font-src 'self'",
    // ws: für Dev-HMR.
    `connect-src 'self'${storageSource}${isDev ? " ws:" : ""}`,
    // Sentry Replay komprimiert Events über einen Blob-Worker.
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  // Request-ID für die Log-Korrelation (lib/logger.ts) — vom Reverse Proxy
  // übernehmen, falls schon gesetzt, sonst hier erzeugen. Wird sowohl an
  // den Server (Request-Header) als auch an den Client (Response-Header)
  // weitergereicht.
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy(nonce);

  if (isProtectedPath(request.nextUrl.pathname) && !hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;

    if (target && target !== "/") {
      loginUrl.searchParams.set("next", target);
    }

    const response = NextResponse.redirect(loginUrl);
    response.headers.set("x-request-id", requestId);
    response.headers.set("Content-Security-Policy", csp);

    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  // Next.js liest den Nonce aus diesem Header und wendet ihn automatisch auf
  // seine eigenen (Hydration-/Framework-)Scripts an — siehe
  // node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Läuft jetzt auf praktisch jeder Seite (für die CSP), außer:
     * - api (JSON-Antworten, kein HTML-Rendering-Kontext)
     * - _next/static, _next/image (Assets, keine eigene CSP nötig)
     * - favicon.ico, robots.txt, sitemap.xml (keine HTML-Dokumente)
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
