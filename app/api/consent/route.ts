import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { invalidRequestResponse } from "@/lib/api/validation";

export const runtime = "nodejs";

const consentSchema = z.object({
  value: z.enum(["granted", "denied"]),
  bannerVersion: z.string().optional(),
});

/**
 * Serverseitiger Nachweis der Cookie-Consent-Entscheidung (Art. 7 Abs. 1
 * DSGVO). Wird von components/CookieConsent.tsx zusätzlich zum
 * Browser-Cookie aufgerufen. Funktioniert bewusst auch ohne Login, da die
 * Entscheidung schon vor jeder Anmeldung getroffen wird.
 */
export async function POST(request: Request) {
  const clientIpAddress = await getClientIp(request.headers);
  const limit = await checkRateLimit({
    key: `consent:${clientIpAddress}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = await request.json().catch(() => null);
  const parsed = consentSchema.safeParse(body);

  if (!parsed.success) {
    return invalidRequestResponse(parsed.error);
  }

  const { value } = parsed.data;
  const bannerVersion = parsed.data.bannerVersion || "unbekannt";

  const session = await auth.api.getSession({ headers: request.headers });

  await prisma.consentRecord.create({
    data: {
      userId: session?.user?.id ?? null,
      value,
      bannerVersion,
      ipAddress: clientIpAddress,
      userAgent: request.headers.get("user-agent") ?? "",
    },
  });

  return Response.json({ status: "ok" });
}
