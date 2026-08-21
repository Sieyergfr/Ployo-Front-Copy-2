import { auth } from "@/lib/auth";
import { changeAccountPassword } from "@/lib/account-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Passwort ändern. Bewusst vage Fehlermeldung bei falschem `currentPassword` (kein Account-Enumeration-Leak). */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-account-password:${session.user.id}`,
    limit: 10,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    currentPassword?: string;
    newPassword?: string;
    revokeOtherSessions?: boolean;
  } | null;

  if (!body?.currentPassword || !body.newPassword) {
    return Response.json(
      { error: "'currentPassword' und 'newPassword' sind erforderlich." },
      { status: 400 },
    );
  }

  try {
    await changeAccountPassword({
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      revokeOtherSessions: Boolean(body.revokeOtherSessions),
    });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
