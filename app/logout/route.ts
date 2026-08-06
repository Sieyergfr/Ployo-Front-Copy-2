import { NextResponse } from "next/server";

function getSetCookieHeaders(headers: Headers) {
  const extendedHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };

  return extendedHeaders.getSetCookie?.() ?? [headers.get("set-cookie")].filter(Boolean);
}

async function logout(request: Request) {
  const signOutUrl = new URL("/api/auth/sign-out", request.url);
  // Nur die relevanten Header weitergeben: Das HTML-Formular postet als
  // x-www-form-urlencoded, better-auth akzeptiert aber nur application/json
  // (sonst 415 und die Session bleibt bestehen).
  const signOutResponse = await fetch(signOutUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
      origin: request.headers.get("origin") ?? signOutUrl.origin,
    },
    body: "{}",
    cache: "no-store",
  });
  const response = NextResponse.redirect(new URL("/login", request.url), 303);

  for (const cookie of getSetCookieHeaders(signOutResponse.headers)) {
    response.headers.append("set-cookie", cookie);
  }

  return response;
}

export async function POST(request: Request) {
  return logout(request);
}
