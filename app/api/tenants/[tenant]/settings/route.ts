import { auth } from "@/lib/auth";
import { getTenantSettings } from "@/lib/settings-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Vollständige Mandanten-Einstellungen inkl. Firmenadresse und Einladungsliste. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-settings:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const data = await getTenantSettings(tenant);

    if (!data) {
      return Response.json({ error: "Mandant nicht gefunden." }, { status: 404 });
    }

    return Response.json(data);
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
