import { auth } from "@/lib/auth";
import { getPendingAppPopups } from "@/lib/app-popups";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { headers } from "next/headers";

/** Offene Popups für die Mitarbeiter-App, in Anzeigereihenfolge (lib/app-popups.ts). */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-app-popups:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  return Response.json({ popups: await getPendingAppPopups(session.user.id) });
}
