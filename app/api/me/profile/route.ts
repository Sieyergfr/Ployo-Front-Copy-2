import { auth } from "@/lib/auth";
import { updateMyProfile, type MyProfileFields } from "@/lib/self-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Profil-Screen: eigene Personalakte-Felder aktualisieren (Partial-Update). */
export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-profile-update:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as
    | ({ tenant?: string } & Partial<MyProfileFields>)
    | null;

  if (!body?.tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const { tenant, ...fields } = body;

  try {
    await updateMyProfile(tenant, fields);

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
