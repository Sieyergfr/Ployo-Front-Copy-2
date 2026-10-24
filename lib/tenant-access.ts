import { cache } from "react";
import {
  normalizePermissionScope,
  permissionLevels,
  type PermissionLevel,
  type PermissionScope,
} from "@/lib/roles";
import {
  getBillingBlockReason,
  isStripeConfiguredForBilling,
  tenantBillingSelect,
  type TenantBillingFields,
} from "@/lib/billing-access";

export type TenantPermissionArea =
  | "employees" | "contracts" | "employeeFiles" | "payroll" | "sensitiveData" | "mutterschutz"
  | "locations" | "teams" | "files"
  | "vacation" | "sickness" | "shifts" | "timeTracking" | "reminders" | "audit"
  | "roles" | "settings";

export const tenantPermissionAreas: TenantPermissionArea[] = [
  "employees", "contracts", "employeeFiles", "payroll", "sensitiveData", "mutterschutz",
  "locations", "teams", "files",
  "vacation", "sickness", "shifts", "timeTracking", "reminders", "audit",
  "roles", "settings",
];

export type TenantAccess = {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  userName: string;
  membershipRole: string;
  roleId: string | null;
  /** Bereich, für den diese Access-Auflösung berechnet wurde — bestimmt z. B. bei `resolveScopeFilter`, ob "assigned" als Standort- oder Team-Zuweisung aufgelöst wird. */
  area: TenantPermissionArea;
  permissionLevel: PermissionLevel;
  /**
   * Sichtbarkeit für den geprüften Bereich: "own" (nur eigene Daten), "team"
   * (Daten des eigenen Teams), "assigned" (nur der zugewiesene Standort bzw.
   * die eigenen Teams — nur für locations/teams) oder "all" (mandantenweit).
   * Tenant-Manager (OWNER/ADMIN/HR) und Bereiche ohne Scope-Unterstützung
   * sind immer "all".
   */
  scope: PermissionScope;
  /** Löschen erlaubt, unabhängig vom allgemeinen level (siehe lib/roles.ts). */
  canDelete: boolean;
  canUploadFiles: boolean;
  canEditFiles: boolean;
  canViewFiles: boolean;
  /** Audit-Trail für diesen Bereich sichtbar (pro Bereich statt einem einzigen globalen Recht). */
  canViewAudit: boolean;
  /** Nur für locations/teams gesetzt (eingebettete Schichtansicht/-bearbeitung) — sonst null. */
  shiftsLevel: PermissionLevel | null;
};

/** Für die Rollen-/Berechtigungsanzeige (Rollen-Editor, künftige Client-Gating-Stellen) — die volle Matrix pro Bereich statt nur `level`. */
export type PermissionCapabilities = {
  level: PermissionLevel;
  scope: PermissionScope;
  canDelete: boolean;
  canUploadFiles: boolean;
  canEditFiles: boolean;
  canViewFiles: boolean;
  canViewAudit: boolean;
  shiftsLevel: PermissionLevel | null;
};

type RolePermissionRow = {
  area: string;
  level: PermissionLevel;
  scope: string;
  canDelete: boolean;
  canUploadFiles: boolean;
  canEditFiles: boolean;
  canViewFiles: boolean;
  canViewAudit: boolean;
  shiftsLevel: PermissionLevel | null;
};

const getSessionUser = cache(async () => {
  const [{ headers }, { auth }] = await Promise.all([
    import("next/headers"),
    import("@/lib/auth"),
  ]);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session.user;
});

function hasRequiredLevel(actual: PermissionLevel, required: PermissionLevel) {
  return permissionLevels.indexOf(actual) >= permissionLevels.indexOf(required);
}

/**
 * Berechnet die Berechtigungsstufe je Bereich für eine Mitgliedschaft — die
 * gleiche Logik wie `resolveTenantAccessForUser`, aber für alle Bereiche auf
 * einmal (für Navigation/Einstellungen, die im Voraus wissen müssen, was
 * überhaupt sichtbar sein darf, statt das je Bereich einzeln abzufragen).
 */
export function computePermissionLevels(membership: {
  role: string;
  roleRef: { permissions: { area: string; level: PermissionLevel }[] } | null;
}): Record<TenantPermissionArea, PermissionLevel> {
  const isTenantManager = ["OWNER", "ADMIN", "HR"].includes(membership.role);
  const levelByArea = new Map(
    membership.roleRef?.permissions.map((permission) => [permission.area, permission.level]) ?? [],
  );

  return Object.fromEntries(
    tenantPermissionAreas.map((area) => [
      area,
      isTenantManager ? "admin" : (levelByArea.get(area) ?? "none"),
    ]),
  ) as Record<TenantPermissionArea, PermissionLevel>;
}

/**
 * DB-Kern von `requireTenantAccess`, losgelöst von der Next.js-Session
 * (nimmt `userId`/`userName` direkt entgegen). Ausgelagert, damit die
 * eigentliche Autorisierungs-Entscheidung ohne Request-Kontext gegen eine
 * echte Test-DB geprüft werden kann (siehe tests/tenant-access.test.ts).
 */
export type TenantAccessOptions = {
  /**
   * Abo-Sperre überspringen — nur für das, was ein gesperrter Mandant zum
   * Entsperren bzw. für seine Daten braucht (Checkout, Zahlungsverwaltung,
   * Rechnungen, DSGVO-Datenexport).
   */
  allowBillingBlocked?: boolean;
};

/** Wirft "SUBSCRIPTION_REQUIRED", wenn der Mandant wegen des Abos gesperrt ist (lib/billing-access.ts). */
function assertBillingAccess(tenant: TenantBillingFields, options?: TenantAccessOptions) {
  if (options?.allowBillingBlocked) return;

  if (getBillingBlockReason(tenant, isStripeConfiguredForBilling())) {
    throw new Error("SUBSCRIPTION_REQUIRED");
  }
}

export async function resolveTenantAccessForUser(
  user: { id: string; name?: string | null; email: string; twoFactorEnabled?: boolean | null },
  tenantSlug: string,
  area: TenantPermissionArea,
  required: PermissionLevel = "read",
  options?: TenantAccessOptions,
): Promise<TenantAccess> {
  const { prisma } = await import("@/lib/prisma");
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId: user.id, tenant: { slug: tenantSlug } },
    select: {
      role: true,
      roleId: true,
      tenant: {
        select: {
          id: true,
          slug: true,
          settings: { select: { twoFactorRequired: true } },
          ...tenantBillingSelect,
        },
      },
      roleRef: {
        select: {
          permissions: {
            where: { area },
            select: {
              level: true,
              scope: true,
              canDelete: true,
              canUploadFiles: true,
              canEditFiles: true,
              canViewFiles: true,
              canViewAudit: true,
              shiftsLevel: true,
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!membership) throw new Error("FORBIDDEN");

  if (membership.tenant.settings?.twoFactorRequired && !user.twoFactorEnabled) {
    throw new Error("TWO_FACTOR_REQUIRED");
  }

  assertBillingAccess(membership.tenant, options);

  const membershipRole = membership.role;
  const isTenantManager = ["OWNER", "ADMIN", "HR"].includes(membershipRole);
  const permissionRow = membership.roleRef?.permissions[0];
  const rawLevel = permissionRow?.level;
  const permissionLevel = permissionLevels.includes(rawLevel as PermissionLevel)
    ? (rawLevel as PermissionLevel)
    : "none";
  const scope = isTenantManager
    ? "all"
    : normalizePermissionScope(permissionRow?.scope ?? null);

  if (!isTenantManager && !hasRequiredLevel(permissionLevel, required)) {
    throw new Error("FORBIDDEN");
  }

  return {
    tenantId: membership.tenant.id,
    tenantSlug: membership.tenant.slug,
    userId: user.id,
    userName: user.name || user.email,
    membershipRole,
    roleId: membership.roleId,
    area,
    permissionLevel: isTenantManager ? "admin" : permissionLevel,
    scope,
    canDelete: isTenantManager || (permissionRow?.canDelete ?? false),
    canUploadFiles: isTenantManager || (permissionRow?.canUploadFiles ?? false),
    canEditFiles: isTenantManager || (permissionRow?.canEditFiles ?? false),
    canViewFiles: isTenantManager || (permissionRow?.canViewFiles ?? false),
    canViewAudit: isTenantManager || (permissionRow?.canViewAudit ?? false),
    shiftsLevel: isTenantManager ? "admin" : (permissionRow?.shiftsLevel ?? null),
  };
}

/** Central authorization boundary for every tenant-scoped DAL read and write. */
export async function requireTenantAccess(
  tenantSlug: string,
  area: TenantPermissionArea,
  required: PermissionLevel = "read",
  options?: TenantAccessOptions,
): Promise<TenantAccess> {
  const user = await getSessionUser();

  return resolveTenantAccessForUser(user, tenantSlug, area, required, options);
}

/**
 * Erkennt eingeladene `EMPLOYEE`-Mitglieder ohne zugewiesene Berechtigungsrolle
 * — diese haben auf praktisch keinem Tenant-Bereich Zugriff und sollten statt
 * des (dann leeren) Übersichts-Dashboards direkt den Self-Service-Bereich sehen.
 */
export async function isUnassignedEmployee(tenantSlug: string) {
  const { prisma } = await import("@/lib/prisma");
  const user = await getSessionUser().catch(() => null);

  if (!user) return false;

  const membership = await prisma.tenantMembership.findFirst({
    where: { userId: user.id, tenant: { slug: tenantSlug } },
    select: { role: true, roleId: true },
  });

  return Boolean(membership && membership.role === "EMPLOYEE" && !membership.roleId);
}

/**
 * Leichte Prüfung für Self-Service-Bereiche: jedes Mitglied eines Mandanten
 * darf auf die eigenen Daten zugreifen (Urlaub/Krankheit/Dokumente),
 * unabhängig von Rollen-Berechtigungen für die tenant-weiten Bereiche.
 */
export async function requireTenantMembership(
  tenantSlug: string,
  options?: TenantAccessOptions,
): Promise<TenantAccess> {
  const { prisma } = await import("@/lib/prisma");
  const user = await getSessionUser();
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId: user.id, tenant: { slug: tenantSlug } },
    select: {
      role: true,
      roleId: true,
      tenant: {
        select: {
          id: true,
          slug: true,
          settings: { select: { twoFactorRequired: true } },
          ...tenantBillingSelect,
        },
      },
    },
  });

  if (!membership) throw new Error("FORBIDDEN");

  if (membership.tenant.settings?.twoFactorRequired && !user.twoFactorEnabled) {
    throw new Error("TWO_FACTOR_REQUIRED");
  }

  assertBillingAccess(membership.tenant, options);

  return {
    tenantId: membership.tenant.id,
    tenantSlug: membership.tenant.slug,
    userId: user.id,
    userName: user.name || user.email,
    membershipRole: membership.role,
    roleId: membership.roleId,
    // Kein konkreter Bereich geprüft — scope ist immer "all", daher wird
    // `area` von `resolveScopeFilter` hier nie konsultiert.
    area: "employees",
    permissionLevel: "none",
    scope: "all",
    canDelete: false,
    canUploadFiles: false,
    canEditFiles: false,
    canViewFiles: false,
    canViewAudit: false,
    shiftsLevel: null,
  };
}

const emptyPermissionLevels = Object.fromEntries(
  tenantPermissionAreas.map((area) => [area, "none" as PermissionLevel]),
) as Record<TenantPermissionArea, PermissionLevel>;

/**
 * Nicht werfende Variante für UI-Entscheidungen (z. B. ob ein "Anlegen"- oder
 * "Löschen"-Button überhaupt angezeigt wird) — die tatsächliche Durchsetzung
 * bleibt weiterhin bei requireTenantAccess in den jeweiligen Server Actions.
 * Ohne Mitgliedschaft (oder ohne Session) liefert dies einfach "none" überall,
 * statt zu werfen.
 */
export async function getTenantPermissions(
  tenantSlug: string,
): Promise<Record<TenantPermissionArea, PermissionLevel>> {
  const user = await getSessionUser().catch(() => null);

  if (!user) return emptyPermissionLevels;

  const { prisma } = await import("@/lib/prisma");
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId: user.id, tenant: { slug: tenantSlug } },
    select: {
      role: true,
      roleRef: {
        select: {
          permissions: { select: { area: true, level: true } },
        },
      },
    },
  });

  if (!membership) return emptyPermissionLevels;

  return computePermissionLevels(membership);
}

function fullCapabilities(): Omit<PermissionCapabilities, "level" | "scope"> {
  return {
    canDelete: true,
    canUploadFiles: true,
    canEditFiles: true,
    canViewFiles: true,
    canViewAudit: true,
    shiftsLevel: "admin",
  };
}

function emptyCapabilities(): Omit<PermissionCapabilities, "level" | "scope"> {
  return {
    canDelete: false,
    canUploadFiles: false,
    canEditFiles: false,
    canViewFiles: false,
    canViewAudit: false,
    shiftsLevel: null,
  };
}

/**
 * Wie `computePermissionLevels`, liefert aber pro Bereich die volle Matrix
 * (level + scope + canDelete/canUploadFiles/canEditFiles/canViewFiles/
 * canViewAudit/shiftsLevel) statt nur `level` — für den Rollen-Editor und
 * künftige Client-Gating-Stellen. Bewusst eine eigene Funktion statt
 * `computePermissionLevels` selbst umzubauen: dessen Rückgabeform
 * (`Record<Area, PermissionLevel>`) wird an vielen bestehenden Stellen
 * (`hasPermissionLevel(permissions.area, ...)`) direkt als Level erwartet —
 * die auf die neuen Capability-Flags umzustellen ist eine eigene Aufgabe.
 */
export function computePermissionCapabilities(membership: {
  role: string;
  roleRef: { permissions: RolePermissionRow[] } | null;
}): Record<TenantPermissionArea, PermissionCapabilities> {
  const isTenantManager = ["OWNER", "ADMIN", "HR"].includes(membership.role);
  const byArea = new Map(
    membership.roleRef?.permissions.map((permission) => [permission.area, permission]) ?? [],
  );

  return Object.fromEntries(
    tenantPermissionAreas.map((area) => {
      if (isTenantManager) {
        return [area, { level: "admin", scope: "all", ...fullCapabilities() }];
      }

      const permission = byArea.get(area);

      return [
        area,
        {
          level: permission?.level ?? "none",
          scope: normalizePermissionScope(permission?.scope ?? null),
          canDelete: permission?.canDelete ?? false,
          canUploadFiles: permission?.canUploadFiles ?? false,
          canEditFiles: permission?.canEditFiles ?? false,
          canViewFiles: permission?.canViewFiles ?? false,
          canViewAudit: permission?.canViewAudit ?? false,
          shiftsLevel: permission?.shiftsLevel ?? null,
        },
      ];
    }),
  ) as Record<TenantPermissionArea, PermissionCapabilities>;
}

const emptyCapabilitiesByArea = Object.fromEntries(
  tenantPermissionAreas.map((area) => [
    area,
    { level: "none" as PermissionLevel, scope: "all" as PermissionScope, ...emptyCapabilities() },
  ]),
) as Record<TenantPermissionArea, PermissionCapabilities>;

/** Wie `getTenantPermissions`, aber mit der vollen Capability-Matrix je Bereich — siehe `computePermissionCapabilities`. */
export async function getTenantCapabilities(
  tenantSlug: string,
): Promise<Record<TenantPermissionArea, PermissionCapabilities>> {
  const user = await getSessionUser().catch(() => null);

  if (!user) return emptyCapabilitiesByArea;

  const { prisma } = await import("@/lib/prisma");
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId: user.id, tenant: { slug: tenantSlug } },
    select: {
      role: true,
      roleRef: {
        select: {
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
      },
    },
  });

  if (!membership) return emptyCapabilitiesByArea;

  return computePermissionCapabilities(membership);
}

export type ScopeFilter =
  | { type: "all" }
  | { type: "own"; employeeId: string | null }
  | { type: "team"; employeeId: string | null; teamIds: string[]; teammateIds: string[] }
  | { type: "assigned"; area: "locations"; employeeId: string | null; locationNames: string[] }
  | { type: "assigned"; area: "teams"; employeeId: string | null; teamIds: string[] };

/**
 * Übersetzt den Scope einer geprüften Berechtigung (own/team/assigned/all) in
 * einen Datenbankfilter. Löst dafür bei "own"/"team"/"assigned" den mit der
 * Session verknüpften eigenen Mitarbeiterdatensatz auf. Ist keiner verknüpft
 * (Konto ohne Personalakte), liefert das einen Filter, der garantiert nichts
 * trifft — nie stillschweigend zu "alles sehen" zurückfallen.
 */
export async function resolveScopeFilter(access: TenantAccess): Promise<ScopeFilter> {
  if (access.scope === "all") {
    return { type: "all" };
  }

  const { prisma } = await import("@/lib/prisma");

  if (access.scope === "assigned") {
    const me = await prisma.tenantEmployee.findFirst({
      where: { tenantId: access.tenantId, userId: access.userId },
      select: { id: true, location: true },
    });

    if (access.area === "teams") {
      const memberships = me
        ? await prisma.tenantTeamMember.findMany({
            where: { employeeId: me.id },
            select: { teamId: true },
          })
        : [];

      return {
        type: "assigned",
        area: "teams",
        employeeId: me?.id ?? null,
        teamIds: memberships.map((membership) => membership.teamId),
      };
    }

    // ACHTUNG — sicherheitsrelevant, bitte separat gegenprüfen: Seit "Mehrere
    // Standorte pro Mitarbeiter" ist `TenantLocationMember` (nicht mehr der
    // einzelne `TenantEmployee.location`-String) die Quelle für die
    // Standort-Zugehörigkeit — analog zur "teams"-Auflösung oben über
    // `TenantTeamMember`. Vorher lieferte dieser Scope nur den einen
    // Primär-Standort; jetzt alle zugewiesenen. Wirkt sich auf jede Stelle
    // aus, die für den "assigned"-Standort-Scope prüft (z. B. Standortliste,
    // Standort-Dateien) — Verhalten für Mitarbeiter mit mehreren Standorten
    // ändert sich dadurch von "nur ihr Hauptstandort sichtbar" zu "alle ihre
    // Standorte sichtbar".
    const locationMemberships = me
      ? await prisma.tenantLocationMember.findMany({
          where: { employeeId: me.id },
          select: { location: { select: { name: true } } },
        })
      : [];

    return {
      type: "assigned",
      area: "locations",
      employeeId: me?.id ?? null,
      locationNames: locationMemberships.map((membership) => membership.location.name),
    };
  }

  const me = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true },
  });

  if (access.scope === "own") {
    return { type: "own", employeeId: me?.id ?? null };
  }

  // Team-Zugehörigkeit kommt aus `TenantTeamMember` (wie beim "assigned"-
  // Scope oben), nicht mehr aus der Freitext-Kopie `TenantEmployee.team`:
  // die kannte nur ein Team, wurde beim Hinzufügen über die Team-Seite nicht
  // gesetzt und überlebte das Löschen des Teams ("Geister-Team", das ein
  // später gleichnamig angelegtes Team automatisch erbte). Ohne eigenes Team
  // bleiben beide Listen leer — der Filter trifft dann nichts (H03).
  const teamIds = me
    ? (
        await prisma.tenantTeamMember.findMany({
          where: { employeeId: me.id, team: { tenantId: access.tenantId } },
          select: { teamId: true },
        })
      ).map((membership) => membership.teamId)
    : [];
  const teammateIds = teamIds.length
    ? Array.from(
        new Set(
          (
            await prisma.tenantTeamMember.findMany({
              where: { teamId: { in: teamIds } },
              select: { employeeId: true },
            })
          ).map((membership) => membership.employeeId),
        ),
      )
    : [];

  return { type: "team", employeeId: me?.id ?? null, teamIds, teammateIds };
}

/**
 * Prüft für einen bereits geladenen Zieldatensatz (z. B. das Profil, das
 * gerade angezeigt wird), ob ein Scope-Filter den Zugriff darauf erlaubt —
 * praktisch, wenn der Datensatz schon vorliegt und keine zusätzliche
 * gefilterte Datenbankabfrage nötig ist (z. B. um Gehaltsdaten aus einem
 * bereits geladenen Mitarbeiterprofil je nach Scope ein-/auszublenden).
 */
export function scopeAllowsTarget(
  scopeFilter: ScopeFilter,
  target: { id: string },
): boolean {
  if (scopeFilter.type === "all") return true;
  if (scopeFilter.type === "own") return scopeFilter.employeeId === target.id;
  if (scopeFilter.type === "team") return scopeFilter.teammateIds.includes(target.id);

  // "assigned" gilt für Standorte/Teams — nicht für Mitarbeiter-Zieldatensätze
  // (Mitarbeiter/Gehaltsabrechnungen), auf die diese Hilfsfunktion bisher
  // ausschließlich angewendet wird. Sicherheitshalber verweigern statt zu
  // raten, welches Ziel gemeint sein könnte.
  return false;
}

/**
 * Wie `scopeAllowsTarget`, lädt den Zieldatensatz aber selbst und wirft
 * `FORBIDDEN`, wenn er außerhalb des Ausschnitts liegt.
 *
 * Für **Schreibpfade** gedacht: der Scope filterte bisher nur Listen. Wer
 * `sickness: write` mit Scope "own" hatte, konnte über eine mitgeschickte
 * fremde `employeeId`/`reportId` trotzdem fremde Datensätze anlegen, ändern
 * oder abschließen — sichtbar waren sie ihm nur nicht.
 */
export async function assertEmployeeInScope(
  access: TenantAccess,
  employeeId: string | null | undefined,
) {
  const scopeFilter = await resolveScopeFilter(access);

  if (scopeFilter.type === "all") return;
  if (!employeeId) throw new Error("FORBIDDEN");

  const { prisma } = await import("@/lib/prisma");
  const employee = await prisma.tenantEmployee.findFirst({
    where: { id: employeeId, tenantId: access.tenantId },
    select: { id: true },
  });

  if (!employee || !scopeAllowsTarget(scopeFilter, employee)) {
    throw new Error("FORBIDDEN");
  }
}

/**
 * Wie `assertEmployeeInScope`, aber für den "assigned"-Team-Scope: prüft, ob
 * die übergebene Team-ID zu den dem Aufrufer zugewiesenen Teams gehört.
 * Mehrere Team-Mutationsservices hatten bisher nur den tenantweiten
 * Level-Guard (`requireTeamManager`), aber keine Objektscope-Prüfung — ein
 * Team-Verwalter mit "assigned"-Scope konnte damit über eine mitgeschickte
 * fremde `teamId` auch andere Teams desselben Mandanten ändern
 * (Audit-Finding H05).
 */
export async function assertTeamInScope(
  access: TenantAccess,
  teamId: string | null | undefined,
) {
  const scopeFilter = await resolveScopeFilter(access);

  if (scopeFilter.type === "all") return;
  if (!teamId) throw new Error("FORBIDDEN");

  if (
    scopeFilter.type === "assigned" &&
    scopeFilter.area === "teams" &&
    scopeFilter.teamIds.includes(teamId)
  ) {
    return;
  }

  throw new Error("FORBIDDEN");
}

/**
 * Wie `assertTeamInScope`, aber für den "assigned"-Standort-Scope. Der
 * Standort-Scope wird über den Namen aufgelöst (siehe `locationScopeWhere`
 * in location-service.ts), daher hier ein zusätzlicher Lookup von der
 * mitgeschickten ID auf den gespeicherten Namen.
 */
export async function assertLocationInScope(
  access: TenantAccess,
  locationId: string | null | undefined,
) {
  const scopeFilter = await resolveScopeFilter(access);

  if (scopeFilter.type === "all") return;
  if (!locationId) throw new Error("FORBIDDEN");

  if (scopeFilter.type === "assigned" && scopeFilter.area === "locations") {
    const { prisma } = await import("@/lib/prisma");
    const location = await prisma.tenantLocation.findFirst({
      where: { id: locationId, tenantId: access.tenantId },
      select: { name: true },
    });

    if (location && scopeFilter.locationNames.includes(location.name)) {
      return;
    }
  }

  throw new Error("FORBIDDEN");
}

/**
 * Nicht werfende Variante von requireTenantAccess — für Stellen, an denen
 * ein optionaler Datenblock (z. B. Gehaltsabrechnungen in einem
 * Mitarbeiterprofil) nur bei ausreichender Berechtigung mitgeladen werden
 * soll, ohne dass ihr Fehlen die ganze Seite sperrt.
 */
export async function getOptionalTenantAccess(
  tenantSlug: string,
  area: TenantPermissionArea,
  required: PermissionLevel = "read",
): Promise<TenantAccess | null> {
  try {
    return await requireTenantAccess(tenantSlug, area, required);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return null;
    throw error;
  }
}

/**
 * Prüft, ob zwei User mindestens einen gemeinsamen Tenant teilen — z. B. für
 * global (nicht tenantgebunden) gespeicherte Ressourcen wie Profilbilder, bei
 * denen eine bloß bekannte User-ID allein keine Sichtberechtigung sein darf
 * (Sicherheitsaudit L03).
 */
export async function sharesTenantWith(userIdA: string, userIdB: string): Promise<boolean> {
  if (userIdA === userIdB) return true;

  const { prisma } = await import("@/lib/prisma");
  const shared = await prisma.tenantMembership.findFirst({
    where: { userId: userIdA, tenant: { memberships: { some: { userId: userIdB } } } },
    select: { id: true },
  });

  return shared !== null;
}

/**
 * Für Top-Level-Seiten unter /u/[tenant]/*: lädt die übergebene Funktion und
 * leitet bei FORBIDDEN auf die "Kein Zugriff"-Seite um, statt den Fehler bis
 * zur generischen Error-Boundary durchzureichen. Server-Component-Fehler
 * werden von Next.js in Produktion redigiert (error.message ist dort nicht
 * mehr "FORBIDDEN"), daher muss der Fall hier — noch mit der echten Message —
 * abgefangen werden.
 */
export async function withAccessRedirect<T>(
  tenantSlug: string,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      const { redirect } = await import("next/navigation");
      redirect(`/u/${tenantSlug}/kein-zugriff`);
    }

    if (err instanceof Error && err.message === "TWO_FACTOR_REQUIRED") {
      const { redirect } = await import("next/navigation");
      redirect(`/u/${tenantSlug}/zwei-faktor-erforderlich`);
    }

    if (err instanceof Error && err.message === "SUBSCRIPTION_REQUIRED") {
      const { redirect } = await import("next/navigation");
      redirect(`/u/${tenantSlug}/abo-erforderlich`);
    }

    throw err;
  }
}
