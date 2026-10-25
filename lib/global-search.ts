import "server-only";

import { employeeScopeWhere } from "@/lib/employee-service";
import { getFilesPageData } from "@/lib/files-server";
import { locationScopeWhere } from "@/lib/location-service";
import { prisma } from "@/lib/prisma";
import { teamScopeWhere } from "@/lib/team-service";
import { requireTenantAccess, requireTenantMembership } from "@/lib/tenant-access";

/**
 * Globale Suche (⌘K): Mitarbeiter, Standorte, Teams und Dateien. Jede Gruppe
 * nutzt dieselbe Rechte- und Scope-Prüfung wie die jeweilige Liste — fehlt
 * die Berechtigung für einen Bereich, bleibt die Gruppe einfach leer.
 */

export type SearchResultKind = "employee" | "location" | "team" | "file";

export type SearchResult = {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const PER_GROUP = 5;

async function optional<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch {
    return [];
  }
}

export async function searchTenant(tenantSlug: string, rawQuery: string): Promise<SearchResult[]> {
  const query = rawQuery.trim().slice(0, 80);

  if (query.length < 2) {
    return [];
  }

  // Mitgliedschaft prüfen — wirft für fremde Mandanten bzw. ohne Anmeldung.
  await requireTenantMembership(tenantSlug);

  const contains = { contains: query, mode: "insensitive" as const };
  const base = `/u/${tenantSlug}`;

  // Bewusst nacheinander: jede Gruppe löst ihre Rechte selbst auf, und die
  // Abfragen sind klein (je höchstens fünf Treffer).
  const groups: Array<() => Promise<SearchResult[]>> = [
    async () => {
      const where = await employeeScopeWhere(tenantSlug);
      const rows = await prisma.tenantEmployee.findMany({
        where: {
          ...where,
          status: { not: "former" },
          OR: [{ name: contains }, { employeeNumber: contains }, { role: contains }, { team: contains }, { location: contains }],
        },
        select: { key: true, name: true, role: true, team: true, location: true, employeeNumber: true },
        orderBy: { name: "asc" },
        take: PER_GROUP,
      });

      return rows.map<SearchResult>((row) => ({
        kind: "employee",
        id: row.key,
        title: row.name,
        subtitle: [row.role, row.team, row.location].filter(Boolean).join(" · ") || row.employeeNumber,
        href: `${base}/employees/${row.key}`,
      }));
    },
    async () => {
      const access = await requireTenantAccess(tenantSlug, "locations", "read");
      const where = await locationScopeWhere(access);
      const rows = await prisma.tenantLocation.findMany({
        where: { ...where, OR: [{ name: contains }, { kind: contains }, { address: { city: contains } }] },
        select: { key: true, name: true, kind: true, address: { select: { street: true, houseNumber: true, city: true } } },
        orderBy: { name: "asc" },
        take: PER_GROUP,
      });

      return rows.map<SearchResult>((row) => ({
        kind: "location",
        id: row.key,
        title: row.name,
        subtitle: [row.kind, [row.address?.street, row.address?.houseNumber].filter(Boolean).join(" "), row.address?.city]
          .filter(Boolean)
          .join(" · "),
        href: `${base}/standorte/${row.key}`,
      }));
    },
    async () => {
      const access = await requireTenantAccess(tenantSlug, "teams", "read");
      const where = await teamScopeWhere(access);
      const rows = await prisma.tenantTeam.findMany({
        where: { ...where, OR: [{ name: contains }, { description: contains }, { locations: contains }] },
        select: { key: true, name: true, locations: true, _count: { select: { members: true } } },
        orderBy: { name: "asc" },
        take: PER_GROUP,
      });

      return rows.map<SearchResult>((row) => ({
        kind: "team",
        id: row.key,
        title: row.name,
        subtitle: [row.locations, `${row._count.members} Mitglieder`].filter(Boolean).join(" · "),
        href: `${base}/teams/${row.key}`,
      }));
    },
    async () => {
      // Über dieselbe Funktion wie die Dateien-Seite: Datei-ACL,
      // Ordnerrechte und Uploader-Scope gelten damit unverändert.
      const data = await getFilesPageData(tenantSlug);
      const needle = query.toLocaleLowerCase("de");

      return data.files
        .filter((file) => [file.name, file.folder, file.documentType].join(" ").toLocaleLowerCase("de").includes(needle))
        .slice(0, PER_GROUP)
        .map<SearchResult>((file) => ({
          kind: "file",
          id: file.slug,
          title: file.name,
          subtitle: [file.folderSlug ? file.folder : null, file.size].filter(Boolean).join(" · "),
          href: file.folderSlug ? `${base}/dateien/${file.folderSlug}/${file.slug}` : `${base}/dateien/${file.slug}`,
        }));
    },
  ];
  const results: SearchResult[] = [];

  for (const group of groups) {
    results.push(...(await optional(group)));
  }

  return results;
}
