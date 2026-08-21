import { auth } from "@/lib/auth";
import { getOwnPreferences, updateOwnPreferences } from "@/lib/account-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { headers } from "next/headers";

/**
 * Profil-Screen: Sprache/Zeitzone/Datumsformat + persönliche
 * Benachrichtigungs-Toggles. Kontoweit, nicht mandantenspezifisch — kein
 * `tenant`-Parameter nötig.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const preferences = await getOwnPreferences();

  return Response.json({ preferences });
}

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-preferences-update:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    language?: string;
    timezone?: string;
    startPage?: string;
    dateFormat?: string;
    notifyVacationEvents?: boolean;
    notifyShiftEvents?: boolean;
    pushEnabled?: boolean;
  } | null;

  if (!body) {
    return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const current = await getOwnPreferences();

  await updateOwnPreferences({
    language: body.language ?? current.language,
    timezone: body.timezone ?? current.timezone,
    startPage: body.startPage ?? current.startPage,
    dateFormat: body.dateFormat ?? current.dateFormat,
    notifyVacationEvents: body.notifyVacationEvents ?? current.notifyVacationEvents,
    notifyShiftEvents: body.notifyShiftEvents ?? current.notifyShiftEvents,
    pushEnabled: body.pushEnabled ?? current.pushEnabled,
  });

  return Response.json({ status: true });
}
