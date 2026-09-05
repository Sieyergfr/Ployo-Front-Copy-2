import { headers } from "next/headers";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isTrackablePath, recordPageView, referrerHostFrom } from "@/lib/analytics";

export const runtime = "nodejs";

/**
 * Eigenes, cookie-freies Pageview-Tracking (s. lib/analytics.ts) — wird per
 * `navigator.sendBeacon` von components/PageviewBeacon.tsx auf den
 * öffentlichen Marketing-/Rechtsseiten aufgerufen. Ohne Sitzungsprüfung
 * (auch für nicht angemeldete Besucher), daher IP-basiertes Rate-Limit
 * gegen Missbrauch — gleiches Muster wie app/api/contact/route.ts.
 */
async function clientKey() {
  const headerList = await headers();
  const realIp = headerList.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = headerList.get("x-forwarded-for")?.split(",");
  const lastHop = forwarded?.[forwarded.length - 1]?.trim();

  return lastHop || "unknown";
}

export async function POST(request: Request) {
  const limit = await checkRateLimit({
    key: `pageview:${await clientKey()}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path : "";

  if (!path || !isTrackablePath(path)) {
    return new Response(null, { status: 204 });
  }

  const headerList = await headers();
  const referrerHost = referrerHostFrom(headerList.get("referer"));

  await recordPageView({ path, referrerHost });

  return new Response(null, { status: 204 });
}
