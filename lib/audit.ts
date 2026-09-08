import { prisma } from "@/lib/prisma";
import {
  assertEmployeeInScope,
  assertLocationInScope,
  assertTeamInScope,
  requireTenantAccess,
  type TenantPermissionArea,
} from "@/lib/tenant-access";

/**
 * Ordnet jeden bekannten `entityType` (siehe die `entityType`-Werte an allen
 * `recordTenantAudit`-Aufrufstellen) fest seinem fachlichen Bereich zu.
 * Serverseitig aus `entityType` abgeleitet, NIE vom Aufrufer mitgeschickt —
 * vorher wählte der Aufrufer `area` unabhängig vom tatsächlich abgefragten
 * `entityType` frei, sodass z. B. Leserecht in "reminders" plus dessen
 * `canViewAudit` genügte, um das Audit-Log eines fremden Mitarbeiters
 * (`entityType: "employee"`) abzufragen (Audit-Finding M13). Ein
 * unbekannter `entityType` wird abgelehnt statt geraten.
 */
const AUDIT_AREA_BY_ENTITY_TYPE: Partial<Record<string, TenantPermissionArea>> = {
  employee: "employees",
  "info-request": "employees",
  team: "teams",
  location: "locations",
  file: "files",
  "file-folder": "files",
  "employee-folder-template": "files",
  shift: "shifts",
  "shift-week": "shifts",
  "shift-conflict": "shifts",
  "shift-template": "shifts",
  "wish-free-request": "shifts",
  vacation: "vacation",
  "vacation-request": "vacation",
  "vacation-carryover": "vacation",
  sickness: "sickness",
  "sickness-report": "sickness",
  reminder: "reminders",
  reminders: "reminders",
  contract: "contracts",
  payroll: "payroll",
  role: "roles",
  settings: "settings",
  billing: "settings",
  invitation: "settings",
  "tenant-export": "settings",
  "processing-register": "settings",
};

export type AuditLogEntry = {
  id: string;
  actor: string;
  action: string;
  source: string;
  timestamp: string;
  ipAddress?: string;
  detail?: string;
};

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(value);
}

/**
 * Pro-Entity-Audit-Trail (Employee-/Standort-/Team-Detailseiten): geprüft
 * wird das `canViewAudit` des Fachbereichs, der zu `entityType` gehört
 * (`AUDIT_AREA_BY_ENTITY_TYPE`) — nicht mehr ein einziges globales
 * "audit"-Recht, aber auch nicht mehr ein vom Aufrufer frei gewählter
 * Bereich (Audit-Finding M13). Ohne `canViewAudit` liefert dies leer statt
 * zu werfen; die aufrufende Seite entscheidet anhand desselben Flags, ob
 * der Abschnitt überhaupt gerendert wird. Für Entitäten mit bekanntem
 * Objektscope (employee/team/location) wird zusätzlich deren
 * Scope-Zugehörigkeit geprüft — sonst könnte ein team-/own-gescopter
 * Leser über eine fremde `entityId` trotzdem deren Audit-Trail abfragen.
 */
/** Entitätstypen, für die `resolveEntityOwner` unten ein zugrundeliegendes Objekt kennt. */
const ENTITY_TYPES_WITH_RESOLVABLE_OWNER = new Set([
  "vacation",
  "vacation-request",
  "wish-free-request",
  "sickness",
  "sickness-report",
  "contract",
  "payroll",
  "file",
  "file-folder",
  "shift",
]);

/**
 * Löst für Entitätstypen OHNE eigenen Objektscope-Träger (vacation-/wish-
 * free-/sickness-request, Vertrag, Abrechnung, Datei/Ordner) die
 * zugrundeliegende employeeId/teamId/locationId auf, gegen die dann wie bei
 * employee/team/location geprüft werden kann. `null` heißt: kein passendes
 * Objekt gefunden (der spätere Scope-Check schlägt dann korrekt fehl statt
 * mangels Fund alles durchzulassen).
 */
async function resolveEntityOwner(
  entityType: string,
  entityId: string,
): Promise<{ employeeId?: string | null; teamId?: string | null; locationId?: string | null } | null> {
  switch (entityType) {
    case "vacation":
    case "vacation-request": {
      const record = await prisma.tenantVacationRequest.findUnique({
        where: { id: entityId },
        select: { employeeId: true },
      });
      return record;
    }
    case "wish-free-request": {
      const record = await prisma.tenantWishFreeRequest.findUnique({
        where: { id: entityId },
        select: { employeeId: true },
      });
      return record;
    }
    case "sickness":
    case "sickness-report": {
      const record = await prisma.tenantSicknessReport.findUnique({
        where: { id: entityId },
        select: { employeeId: true },
      });
      return record;
    }
    case "contract": {
      const record = await prisma.tenantEmployeeContract.findUnique({
        where: { id: entityId },
        select: { employeeId: true },
      });
      return record;
    }
    case "payroll": {
      const record = await prisma.tenantPayrollStatement.findUnique({
        where: { id: entityId },
        select: { employeeId: true },
      });
      return record;
    }
    case "file":
    case "file-folder": {
      const record =
        entityType === "file"
          ? await prisma.tenantFile.findUnique({
              where: { id: entityId },
              select: { employeeId: true, locationId: true, teamId: true },
            })
          : await prisma.tenantFileFolder.findUnique({
              where: { id: entityId },
              select: { employeeId: true, locationId: true, teamId: true },
            });
      return record;
    }
    case "shift": {
      const record = await prisma.tenantShift.findUnique({
        where: { id: entityId },
        select: { employeeId: true },
      });
      return record;
    }
    default:
      return null;
  }
}

export async function getAuditLogsForEntity(input: {
  tenantSlug: string;
  entityType: string;
  entityId: string;
  take?: number;
}): Promise<AuditLogEntry[]> {
  const area = AUDIT_AREA_BY_ENTITY_TYPE[input.entityType];

  if (!area) {
    throw new Error("FORBIDDEN");
  }

  const access = await requireTenantAccess(input.tenantSlug, area, "read");

  if (!access.canViewAudit) {
    return [];
  }

  if (input.entityType === "employee") {
    await assertEmployeeInScope(access, input.entityId);
  } else if (input.entityType === "team") {
    await assertTeamInScope(access, input.entityId);
  } else if (input.entityType === "location") {
    await assertLocationInScope(access, input.entityId);
  } else {
    // Audit-Finding M13 (Rest): auch Vertrags-/Abrechnungs-/Urlaubs-/
    // Krankheits-/Datei-/Schicht-Audit-Trails haben ein zugrundeliegendes
    // Objekt mit eigenem Scope — ohne diese Auflösung genügte own/team-
    // gescoptes `canViewAudit` bislang, um über eine bekannte fremde
    // `entityId` trotzdem deren Audit-Trail abzufragen.
    const owner = await resolveEntityOwner(input.entityType, input.entityId);

    if (owner?.employeeId) {
      await assertEmployeeInScope(access, owner.employeeId);
    } else if (owner?.teamId) {
      await assertTeamInScope(access, owner.teamId);
    } else if (owner?.locationId) {
      await assertLocationInScope(access, owner.locationId);
    } else if (owner === null && ENTITY_TYPES_WITH_RESOLVABLE_OWNER.has(input.entityType)) {
      // Bekannter, eigentlich auflösbarer Typ, aber kein Objekt gefunden
      // (z. B. bereits gelöscht) — sicherheitshalber verweigern statt eine
      // Owner-Prüfung stillschweigend zu überspringen.
      throw new Error("FORBIDDEN");
    }
  }

  const records = await prisma.tenantAuditLog.findMany({
    where: {
      tenantId: access.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
    },
    orderBy: { createdAt: "desc" },
    take: input.take ?? 25,
  });

  return records.map((record) => ({
    id: record.id,
    actor: record.actorName,
    action: record.action,
    source: record.source,
    timestamp: formatTimestamp(record.createdAt),
    ipAddress: record.ipAddress || undefined,
    detail: record.detail || undefined,
  }));
}

export async function recordTenantAudit(input: {
  tenantId: string;
  actorId: string;
  actorName: string;
  action: string;
  source: string;
  entityType: string;
  entityId: string;
  detail?: string;
  ipAddress?: string;
}) {
  return prisma.tenantAuditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.action,
      source: input.source,
      entityType: input.entityType,
      entityId: input.entityId,
      detail: input.detail ?? "",
      ipAddress: input.ipAddress ?? "",
    },
  });
}
