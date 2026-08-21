import { auth } from "@/lib/auth";
import { getReminderFileBrowserData } from "@/lib/files-server";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Flache Dateiliste (zentral + Mitarbeiter/Standort) für die Verknüpfen-Auswahl
 * beim Anlegen/Bearbeiten einer Erinnerung in der App — dieselbe Datenquelle
 * wie `LinkedFileBrowser` im Web-Dashboard, hier aber ohne dessen
 * Ordner-Navigation, da die App eine einfache durchsuchbare Auswahlliste nutzt.
 */
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
    key: `tenant-reminders-file-options:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const { files } = await getReminderFileBrowserData(tenant);

    return Response.json({ files });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
