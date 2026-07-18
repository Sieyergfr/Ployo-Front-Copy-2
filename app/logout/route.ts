import { NextResponse } from "next/server";

function getSetCookieHeaders(headers: Headers) {
  const extendedHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };

  return extendedHeaders.getSetCookie?.() ?? [headers.get("set-cookie")].filter(Boolean);
}

async function logout(request: Request) {
  const signOutUrl = new URL("/api/auth/sign-out", request.url);
  const signOutResponse = await fetch(signOutUrl, {
    method: "POST",
    headers: request.headers,
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
