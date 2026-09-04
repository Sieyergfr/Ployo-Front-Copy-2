import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Serverseitiger Nachweis der Cookie-Consent-Entscheidung (Art. 7 Abs. 1
 * DSGVO). Wird von components/CookieConsent.tsx zusätzlich zum
 * Browser-Cookie aufgerufen. Funktioniert bewusst auch ohne Login, da die
 * Entscheidung schon vor jeder Anmeldung getroffen wird.
 *
 * `x-real-ip` zuerst, weil nginx den Header aus `$remote_addr` setzt und ein
 * Client ihn damit nicht selbst bestimmen kann. `x-forwarded-for` entsteht
 * dagegen aus `$proxy_add_x_forwarded_for`: der Client darf den Anfang des
 * Headers vorgeben, nginx hängt die echte Adresse nur hinten an — deshalb der
 * letzte Eintrag und nicht der erste.
 */
function clientIp(requestHeaders: Headers): string {
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",");
  const lastHop = forwarded?.[forwarded.length - 1]?.trim();

  return lastHop || "";
}

export async function POST(request: Request) {
  const limit = await checkRateLimit({
    key: `consent:${clientIp(request.headers)}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = await request.json().catch(() => null);
  const value = body?.value;

  if (value !== "granted" && value !== "denied") {
    return Response.json({ error: "Ungültiger Wert." }, { status: 400 });
  }

  const bannerVersion =
    typeof body?.bannerVersion === "string" && body.bannerVersion
      ? body.bannerVersion
      : "unbekannt";

  const session = await auth.api.getSession({ headers: request.headers });

  await prisma.consentRecord.create({
    data: {
      userId: session?.user?.id ?? null,
      value,
      bannerVersion,
      ipAddress: clientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? "",
    },
  });

  return Response.json({ status: "ok" });
}
