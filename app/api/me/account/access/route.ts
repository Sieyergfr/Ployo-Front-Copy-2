import { auth } from "@/lib/auth";
import { deleteOwnAccountAccess } from "@/lib/account-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Löscht sofort den eigenen Konto-Zugang (Zugangsdaten, Sitzungen,
 * Social-Login-Verknüpfungen, Push-Token) — ohne Karenzzeit, anders als die
 * geplante Löschung unter `/api/me/account/deletion`. Die eigene
 * Personalakte (Stammdaten) bleibt beim Arbeitgeber erhalten, s.
 * lib/account-service.ts deleteOwnAccountAccess.
 */
export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-account-access-delete:${session.user.id}`,
    limit: 5,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    await deleteOwnAccountAccess();

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
