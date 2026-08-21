import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computePermissionCapabilities,
  tenantPermissionAreas,
  requireTenantMembership,
  type TenantPermissionArea,
} from "@/lib/tenant-access";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Berechtigungsmatrix für die App-Oberfläche (welche Screens/Aktionen
 * anzeigen). Liefert immer alle zwölf Bereiche, nicht vergebene explizit
 * als "none", damit der Client keine fehlenden Schlüssel interpretieren
 * muss. Nutzt `computePermissionCapabilities` — dieselbe Funktion, die auch
 * `requireTenantAccess` intern für die tatsächliche Durchsetzung
 * zugrunde legt (inkl. OWNER/ADMIN/HR-Manager-Bypass auf "admin"/"true" für
 * jeden Bereich) — die Antwort widerspricht also nie dem, was die
 * anderen Endpunkte tatsächlich durchlassen. Neben `permissions` (Level je
 * Bereich) werden zusätzlich `canDelete`/`canUploadFiles`/`canViewAudit` je
 * Bereich mitgeliefert, da diese Rechte unabhängig vom allgemeinen Level
 * sind (s. lib/tenant-access.ts) und Clients sonst blind ins 403 liefen.
 * Ebenso `scopes` je Bereich ("own"/"team"/"assigned"/"all") — sonst filtert
 * der Server bei Listen still auf einen engeren Ausschnitt, ohne dass die
 * App das an der UI (z. B. "Alle anzeigen"-Hinweis) sichtbar machen könnte.
 *
 * Das ist ein UI-Hinweis, keine Sicherheitsgrenze: durchgesetzt wird
 * weiterhin serverseitig in jeder einzelnen Route.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const tenant = new URL(request.url).searchParams.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-permissions:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const access = await requireTenantMembership(tenant);

    const roleRow = access.roleId
      ? await prisma.tenantRole.findUnique({
          where: { id: access.roleId },
          select: {
            name: true,
            permissions: {
              select: {
                area: true,
                level: true,
                scope: true,
                canDelete: true,
                canUploadFiles: true,
                canEditFiles: true,
                canViewFiles: true,
                canViewAudit: true,
                shiftsLevel: true,
              },
            },
          },
        })
      : null;

    const capabilities = computePermissionCapabilities({
      role: access.membershipRole,
      roleRef: roleRow ? { permissions: roleRow.permissions } : null,
    });

    const pluckFlag = (flag: "canDelete" | "canUploadFiles" | "canViewAudit") =>
      Object.fromEntries(
        tenantPermissionAreas.map((area) => [area, capabilities[area][flag]]),
      ) as Record<TenantPermissionArea, boolean>;

    return Response.json({
      role: access.membershipRole,
      roleName: roleRow?.name ?? null,
      isManager: ["OWNER", "ADMIN", "HR"].includes(access.membershipRole),
      permissions: Object.fromEntries(
        tenantPermissionAreas.map((area) => [area, capabilities[area].level]),
      ),
      scopes: Object.fromEntries(
        tenantPermissionAreas.map((area) => [area, capabilities[area].scope]),
      ),
      canDelete: pluckFlag("canDelete"),
      canUploadFiles: pluckFlag("canUploadFiles"),
      canViewAudit: pluckFlag("canViewAudit"),
    });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
