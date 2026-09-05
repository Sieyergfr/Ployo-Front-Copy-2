import { auth } from "@/lib/auth";
import { permissionAreas, permissionLevels, permissionScopes } from "@/lib/roles";
import { headers } from "next/headers";

/**
 * Statische Referenzdaten für einen Rollen-Editor — nicht Tenant-gebunden,
 * keine DB-Abfrage. Nur Session-Pflicht (keine Rate-Limit nötig, reine
 * Konstantenausgabe).
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  return Response.json(
    { areas: permissionAreas, levels: permissionLevels, scopes: permissionScopes },
    // Reine Code-Konstanten, ändern sich nur mit einem Deploy — clientseitig
    // eine Stunde cachen statt bei jedem Rollen-Editor-Öffnen neu zu holen.
    { headers: { "cache-control": "private, max-age=3600" } },
  );
}
