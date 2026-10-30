import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Vertragstest für die Mitarbeiter-App (`ployo-app`, `src/api/endpoints.ts`).
 *
 * Die App ist eigenständig im Store und wird nicht gleichzeitig mit dem
 * Backend aktualisiert. Jede Route, die sie aufruft, muss deshalb weiter
 * existieren, dieselben Statuscodes/Fehlerformen liefern und alle Felder
 * behalten, die die App liest. Neue Felder sind erlaubt (additiv), entfernte
 * oder umbenannte nicht.
 *
 * Schicht 1: jede App-Route + Methode antwortet ohne Sitzung mit 401 `{ error }`.
 * Schicht 2: echte Aufrufe gegen einen angelegten Betrieb; die Struktur der
 * Antwort wird gegen `tests/contracts/app-api-shapes.json` geprüft
 * (neu schreiben: `UPDATE_APP_CONTRACT=1 npx vitest run tests/app-api-contract.test.ts`
 * — nur nach bewusster, mit der App abgestimmter Änderung).
 */

let currentUserId = "";

// next/headers ist in vitest.config.mts per Alias auf tests/stubs/next-headers.ts gelegt.

// In Next teilt `cache()` aus React ein Ergebnis innerhalb eines Requests —
// u. a. `getSessionUser` in lib/tenant-access.ts läuft so pro Request nur
// einmal. Außerhalb eines Requests ruft React die Funktion jedes Mal neu auf;
// parallele Aufrufe (z. B. /api/me/overview) lösen dann gleichzeitige
// dynamische Importe gemockter Module aus, bei denen Vitest gelegentlich das
// Original liefert. Laufende Aufrufe werden deshalb hier wie in Next geteilt.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const cache = <A extends unknown[], R>(fn: (...args: A) => R) => {
    const inFlight = new Map<string, R>();
    return (...args: A): R => {
      const key = JSON.stringify(args);
      const running = inFlight.get(key);
      if (running !== undefined) return running;
      const result = fn(...args);
      if (result instanceof Promise) {
        inFlight.set(key, result);
        result.finally(() => inFlight.delete(key)).catch(() => {});
      }
      return result;
    };
  };
  return { ...actual, cache, default: { ...actual, cache } };
});

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        currentUserId
          ? {
              user: { id: currentUserId, name: "Contract Test", email: `${currentUserId}@ployo.invalid` },
              session: { id: `session-${currentUserId}`, userId: currentUserId },
            }
          : null,
    },
  },
}));

vi.mock("@/lib/notifications/dispatch", () => ({
  dispatchNotification: async () => {},
}));

// Kein echter Objektspeicher im Test: Signieren läuft lokal mit diesen
// Dummy-Zugangsdaten, alle übrigen S3-Befehle (Upload, Löschen) laufen ins Leere.
process.env.STORAGE_S3_ACCESS_KEY_ID ??= "contract-test";
process.env.STORAGE_S3_SECRET_ACCESS_KEY ??= "contract-test";

vi.mock("@/lib/storage/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/client")>();
  const client = actual.createStorageClient();
  client.send = (async (command: { constructor: { name: string } }) =>
    command.constructor.name === "GetObjectCommand"
      ? {
          ContentLength: 4,
          Body: { transformToWebStream: () => new Blob(["%PDF"]).stream() },
        }
      : {}) as unknown as typeof client.send;
  return { ...actual, getStorageClient: () => client };
});

type RouteParams = Record<string, string>;
type Method = "GET" | "POST" | "PATCH" | "DELETE";
type RouteModule = Record<string, (request: Request, context: { params: Promise<RouteParams> }) => Promise<Response>>;

const BASE_URL = "http://localhost:3000";

async function loadRoute(modulePath: string): Promise<RouteModule> {
  return (await import(/* @vite-ignore */ `@/app/api/${modulePath}/route`)) as RouteModule;
}

async function callRoute(
  modulePath: string,
  method: Method,
  options: {
    params?: RouteParams;
    query?: Record<string, string>;
    body?: unknown;
    formData?: FormData;
    headers?: Record<string, string>;
  } = {},
) {
  const route = await loadRoute(modulePath);
  const handler = route[method];

  if (!handler) {
    throw new Error(`${method} /api/${modulePath} existiert nicht mehr – die App ruft es auf.`);
  }

  const resolvedPath = modulePath.replace(/\[(\w+)\]/g, (_, key: string) => options.params?.[key] ?? key);
  const url = new URL(`/api/${resolvedPath}`, BASE_URL);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers = new Headers(options.headers);
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  const response = await handler(new Request(url, { method, headers, body }), {
    params: Promise.resolve(options.params ?? {}),
  });
  const text = await response.text();
  let json: unknown = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { status: response.status, headers: response.headers, json };
}

/**
 * Alle Routen + Methoden, die die App aufruft (Stand 25.10.2026, aus
 * `ployo-app/src/api/endpoints.ts` und `src/lib/files.ts`). Platzhalter in
 * eckigen Klammern werden mit Dummy-Werten gefüllt — ohne Sitzung darf die
 * Route gar nicht erst so weit kommen.
 */
const APP_ROUTES: Array<[string, Method[]]> = [
  ["tenants", ["GET"]],
  ["me/overview", ["GET"]],
  ["me/info-requests/[requestId]", ["PATCH"]],
  ["me/shifts", ["GET"]],
  ["me/time-tracking", ["GET", "POST"]],
  ["me/time-entries", ["GET"]],
  ["me/team-shifts", ["GET", "POST"]],
  ["me/team-shifts/[shiftId]", ["PATCH", "DELETE"]],
  ["me/team-shifts/publish", ["POST"]],
  ["me/team-shifts/unpublish", ["POST"]],
  ["me/team-shifts/reset", ["POST"]],
  ["me/employees", ["GET"]],
  ["me/wish-free-requests", ["GET", "POST"]],
  ["me/wish-free-requests/[requestId]", ["DELETE"]],
  ["me/vacation-requests", ["POST"]],
  ["me/sickness-reports", ["POST"]],
  ["me/documents", ["POST"]],
  ["me/documents/[fileId]/download", ["GET"]],
  ["me/payroll-statements", ["GET"]],
  ["me/profile", ["PATCH"]],
  ["me/employee-link", ["POST"]],
  ["me/employee-link/unlinked", ["GET"]],
  ["me/locations", ["GET"]],
  ["me/permissions", ["GET"]],
  ["me/preferences", ["GET", "PATCH"]],
  ["me/account/deletion", ["GET", "POST", "DELETE"]],
  ["me/export", ["GET"]],
  ["me/notifications-feed", ["GET"]],
  ["me/notifications-feed/[id]/read", ["POST"]],
  ["me/notifications-feed/read-all", ["POST"]],
  ["me/push-subscriptions", ["POST", "DELETE"]],
  ["tenants/[tenant]/wish-free-requests", ["GET", "POST"]],
  ["tenants/[tenant]/wish-free-requests/[requestId]/approve", ["POST"]],
  ["tenants/[tenant]/wish-free-requests/[requestId]/reject", ["POST"]],
  ["tenants/[tenant]/employees", ["GET", "POST"]],
  ["tenants/[tenant]/employees/[employeeHandle]", ["GET", "PATCH", "DELETE"]],
  ["tenants/[tenant]/employees/folder-templates", ["GET", "POST"]],
  ["tenants/[tenant]/employees/[employeeHandle]/contracts", ["GET", "POST"]],
  ["tenants/[tenant]/employees/[employeeHandle]/contracts/[contractId]", ["PATCH"]],
  ["tenants/[tenant]/employees/[employeeHandle]/payroll-statements", ["GET", "POST"]],
  ["tenants/[tenant]/employees/[employeeHandle]/info-requests", ["POST"]],
  ["tenants/[tenant]/employees/[employeeHandle]/invite", ["POST"]],
  ["tenants/[tenant]/employees/[employeeHandle]/offboard", ["POST"]],
  ["tenants/[tenant]/employees/[employeeHandle]/reactivate", ["POST"]],
  ["tenants/[tenant]/teams", ["GET", "POST"]],
  ["tenants/[tenant]/teams/[teamHandle]", ["GET", "PATCH", "DELETE"]],
  ["tenants/[tenant]/teams/[teamHandle]/assignable-employees", ["GET"]],
  ["tenants/[tenant]/teams/[teamHandle]/lead", ["POST"]],
  ["tenants/[tenant]/teams/[teamHandle]/members", ["POST"]],
  ["tenants/[tenant]/teams/[teamHandle]/members/[memberId]", ["PATCH", "DELETE"]],
  ["tenants/[tenant]/locations", ["GET", "POST"]],
  ["tenants/[tenant]/locations/[locationHandle]", ["GET", "PATCH", "DELETE"]],
  ["tenants/[tenant]/locations/[locationHandle]/employees", ["POST", "DELETE"]],
  ["tenants/[tenant]/roles", ["GET", "POST"]],
  ["tenants/[tenant]/roles/[roleId]", ["GET", "PATCH", "DELETE"]],
  ["tenants/[tenant]/vacation-requests", ["GET", "POST"]],
  ["tenants/[tenant]/vacation-requests/[requestId]", ["PATCH", "DELETE"]],
  ["tenants/[tenant]/vacation-requests/[requestId]/approve", ["POST"]],
  ["tenants/[tenant]/vacation-requests/[requestId]/reject", ["POST"]],
  ["tenants/[tenant]/sickness-reports", ["GET", "POST"]],
  ["tenants/[tenant]/sickness-reports/[reportId]", ["PATCH"]],
  ["tenants/[tenant]/sickness-reports/[reportId]/close", ["POST"]],
  ["tenants/[tenant]/reminders", ["GET", "POST"]],
  ["tenants/[tenant]/reminders/[reminderId]", ["PATCH"]],
  ["tenants/[tenant]/reminders/[reminderId]/complete", ["POST"]],
  ["tenants/[tenant]/reminders/file-options", ["GET"]],
  ["tenants/[tenant]/info-requests", ["GET"]],
  ["tenants/[tenant]/info-requests/[requestId]", ["PATCH"]],
  ["tenants/[tenant]/files", ["GET", "POST"]],
  ["tenants/[tenant]/files/[fileId]", ["PATCH", "DELETE"]],
  ["tenants/[tenant]/files/[fileId]/signed-url", ["GET"]],
  ["tenants/[tenant]/files/[fileId]/access-token", ["GET"]],
  ["tenants/[tenant]/files/folders", ["POST", "PATCH", "DELETE"]],
  ["tenants/[tenant]/files/deleted", ["GET"]],
  ["tenants/[tenant]/files/deleted/[batchId]", ["POST"]],
];

describe("App-Vertrag, Schicht 1: Route existiert und verlangt eine Sitzung", () => {
  const cases = APP_ROUTES.flatMap(([path, methods]) => methods.map((method) => [method, path] as const));

  it.each(cases)("%s /api/%s → 401 { error }", async (method, path) => {
    currentUserId = "";
    const { status, json } = await callRoute(path, method, {
      query: { tenant: "contract-test" },
      body: method === "GET" || method === "DELETE" ? undefined : {},
    });

    expect(status).toBe(401);
    expect(typeof (json as { error?: unknown } | null)?.error).toBe("string");
  });
});

// ─── Schicht 2: Antwort-Struktur ─────────────────────────────────────────

/**
 * Struktur einer JSON-Antwort ohne konkrete Werte: Objekte → Schlüssel mit
 * deren Struktur, Arrays → vereinigte Struktur aller Elemente, sonst der Typ.
 */
type Shape = string | { [key: string]: Shape } | Shape[];

function shapeOf(value: unknown): Shape {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    const merged = value.reduce<Shape | null>((acc, item) => mergeShapes(acc, shapeOf(item)), null);
    return merged === null ? [] : [merged];
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const shape: Record<string, Shape> = {};
    for (const [key, item] of entries) {
      // Objekte als Nachschlage-Tabellen (Schlüssel = DB-ID oder Datum) haben
      // je Lauf andere Schlüssel — für den Vertrag zählt nur die Wertstruktur.
      const slot = dynamicKey(key);
      shape[slot] = slot in shape ? mergeShapes(shape[slot], shapeOf(item)) : shapeOf(item);
    }
    return shape;
  }
  return typeof value;
}

function dynamicKey(key: string) {
  if (/^c[a-z0-9]{20,}$/.test(key)) return "<id>";
  if (/^\d{4}-\d{2}-\d{2}$/.test(key) || /^\d{4}-W\d{1,2}$/.test(key)) return "<date>";
  return key;
}

function mergeShapes(a: Shape | null, b: Shape): Shape {
  if (a === null || a === "null") return b;
  if (b === "null") return a;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length === 0) return b;
    if (b.length === 0) return a;
    return [mergeShapes(a[0], b[0])];
  }
  if (typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const merged: Record<string, Shape> = { ...a };
    for (const [key, value] of Object.entries(b)) {
      merged[key] = key in merged ? mergeShapes(merged[key], value) : value;
    }
    return merged;
  }
  return a;
}

/**
 * Prüft, dass alles aus `expected` (gespeicherter Vertrag) in `actual` noch
 * vorhanden ist. Zusätzliche Felder in `actual` sind erlaubt. `null` gilt in
 * beide Richtungen als verträglich (optionale Felder).
 */
function findContractBreaks(expected: Shape, actual: Shape, path: string, breaks: string[]) {
  if (expected === "null" || actual === "null") return;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      breaks.push(`${path}: war Array, ist jetzt ${JSON.stringify(actual).slice(0, 40)}`);
      return;
    }
    if (expected.length > 0 && actual.length > 0) {
      findContractBreaks(expected[0], actual[0], `${path}[]`, breaks);
    }
    return;
  }
  if (typeof expected === "object") {
    if (typeof actual !== "object" || Array.isArray(actual)) {
      breaks.push(`${path}: war Objekt, ist jetzt ${typeof actual === "string" ? actual : "Array"}`);
      return;
    }
    for (const [key, value] of Object.entries(expected)) {
      if (!(key in actual)) {
        breaks.push(`${path}.${key}: Feld fehlt`);
        continue;
      }
      findContractBreaks(value, actual[key], `${path}.${key}`, breaks);
    }
    return;
  }
  if (expected !== actual) {
    breaks.push(`${path}: Typ war ${expected}, ist jetzt ${typeof actual === "string" ? actual : "Objekt/Array"}`);
  }
}

type ContractEntry = { status: number; shape: Shape };

const CONTRACT_FILE = fileURLToPath(new URL("./contracts/app-api-shapes.json", import.meta.url));
const UPDATE_CONTRACT = process.env.UPDATE_APP_CONTRACT === "1";
const recorded = new Map<string, ContractEntry>();

const RUN_ID = Math.random().toString(36).slice(2, 8);
const users = { owner: "", employee: "", colleague: "" };
let tenantSlug = "";
let tenantId = "";

/** Ruft eine Route als `as` auf, merkt sich Status + Struktur unter `name` und liefert das JSON. */
async function step<T = Record<string, unknown>>(
  name: string,
  as: keyof typeof users,
  path: string,
  method: Method,
  options: Parameters<typeof callRoute>[2] & { expectStatus?: number } = {},
): Promise<T> {
  currentUserId = users[as];
  const { expectStatus, ...callOptions } = options;
  const result = await callRoute(path, method, { ...callOptions, params: { tenant: tenantSlug, ...callOptions.params } }).catch(
    (error: unknown) => {
      throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    },
  );
  const detail = `${name} → ${result.status} ${JSON.stringify(result.json)?.slice(0, 300)}`;

  if (expectStatus === undefined) {
    expect(result.status, detail).toBeLessThan(400);
  } else {
    expect(result.status, detail).toBe(expectStatus);
  }
  recorded.set(name, { status: result.status, shape: shapeOf(result.json) });

  return result.json as T;
}

function isoDate(offsetDays: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

/** Erster Tag ab `offsetDays`, an dem auch der Folgetag ein Werktag ohne Feiertag ist (Mo–Do, nicht um Weihnachten/Neujahr). */
function isoWorkdayPairStart(offsetDays: number) {
  for (let offset = offsetDays; ; offset += 1) {
    const key = isoDate(offset);
    const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
    const monthDay = key.slice(5);

    if (weekday >= 1 && weekday <= 4 && !(monthDay >= "12-23" || monthDay <= "01-02")) {
      return offset;
    }
  }
}

function isoWeek(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return { year: date.getUTCFullYear(), week: Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7) };
}

describe("App-Vertrag, Schicht 2: Antworten behalten ihre Struktur", () => {
  beforeAll(async () => {
    const { prisma } = await import("@/lib/prisma");
    const { createTenantForOwner } = await import("@/lib/tenants");

    for (const key of Object.keys(users) as Array<keyof typeof users>) {
      const user = await prisma.user.create({
        data: { email: `${key}-${RUN_ID}@ployo.invalid`, name: `${key} ${RUN_ID}`, emailVerified: true },
      });
      users[key] = user.id;
    }

    const tenant = await createTenantForOwner({
      name: `Vertragstest ${RUN_ID}`,
      slug: `contract-${RUN_ID}`,
      userId: users.owner,
    } as Parameters<typeof createTenantForOwner>[0]);
    tenantSlug = tenant.slug;
    tenantId = tenant.id;

    await prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, timeTrackingEnabled: true },
      update: { timeTrackingEnabled: true },
    });
  });

  afterAll(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  });

  it("durchläuft alle App-Aufrufe wie die App", async () => {
    const { prisma } = await import("@/lib/prisma");

    // ── Mitarbeiter anlegen und mit Konten verknüpfen ──
    const created = await step<{ employee: { id: string; dbId: string } }>(
      "POST tenants/[tenant]/employees", "owner", "tenants/[tenant]/employees", "POST",
      { body: { firstName: "Erika", lastName: "Muster", email: `erika-${RUN_ID}@ployo.invalid`, employeeNumber: `MA-${RUN_ID}-1`, startDate: isoDate(-400), contract: "Unbefristet", weeklyHours: 40 } },
    );
    const employee = created.employee;
    const second = (await step<{ employee: { id: string; dbId: string } }>(
      "POST tenants/[tenant]/employees (2)", "owner", "tenants/[tenant]/employees", "POST",
      { body: { firstName: "Max", lastName: "Beispiel", email: `max-${RUN_ID}@ployo.invalid`, employeeNumber: `MA-${RUN_ID}-2`, startDate: isoDate(-30) } },
    )).employee;

    const employeeRole = await prisma.tenantRole.findFirstOrThrow({ where: { tenantId, key: "employee" } });
    await prisma.tenantMembership.createMany({
      data: [
        { tenantId, userId: users.employee, role: "EMPLOYEE", roleId: employeeRole.id },
        { tenantId, userId: users.colleague, role: "EMPLOYEE", roleId: employeeRole.id },
      ],
    });
    await prisma.tenantEmployee.update({ where: { id: employee.dbId }, data: { userId: users.employee } });

    await step("GET tenants", "employee", "tenants", "GET");
    await step("GET tenants/[tenant]/employees", "owner", "tenants/[tenant]/employees", "GET");
    await step("GET tenants/[tenant]/employees/[employeeHandle]", "owner", "tenants/[tenant]/employees/[employeeHandle]", "GET", { params: { employeeHandle: employee.id } });
    await step("PATCH tenants/[tenant]/employees/[employeeHandle]", "owner", "tenants/[tenant]/employees/[employeeHandle]", "PATCH", { params: { employeeHandle: employee.id }, body: { phone: "+49 160 1234567" } });
    await step("GET tenants/[tenant]/employees/folder-templates", "owner", "tenants/[tenant]/employees/folder-templates", "GET");
    await step("POST tenants/[tenant]/employees/folder-templates", "owner", "tenants/[tenant]/employees/folder-templates", "POST", { body: { name: "Weiterbildungen" } });

    // ── Standorte ──
    const location = (await step<{ location: { id: string; dbId: string; name: string } }>(
      "POST tenants/[tenant]/locations", "owner", "tenants/[tenant]/locations", "POST",
      { body: { name: "Filiale Mitte", kind: "Filiale", address: { street: "Hauptstraße", houseNumber: "1", postalCode: "80331", city: "München", country: "DE" } } },
    )).location;
    await step("GET tenants/[tenant]/locations", "owner", "tenants/[tenant]/locations", "GET");
    await step("GET tenants/[tenant]/locations/[locationHandle]", "owner", "tenants/[tenant]/locations/[locationHandle]", "GET", { params: { locationHandle: location.id } });
    await step("PATCH tenants/[tenant]/locations/[locationHandle]", "owner", "tenants/[tenant]/locations/[locationHandle]", "PATCH", { params: { locationHandle: location.id }, body: { name: "Filiale Mitte", kind: "Filiale", address: { street: "Hauptstraße", houseNumber: "2", postalCode: "80331", city: "München", country: "DE" } } });
    await step("POST tenants/[tenant]/locations/[locationHandle]/employees", "owner", "tenants/[tenant]/locations/[locationHandle]/employees", "POST", { params: { locationHandle: location.id }, body: { employeeIds: [employee.dbId, second.dbId] } });
    await step("DELETE tenants/[tenant]/locations/[locationHandle]/employees", "owner", "tenants/[tenant]/locations/[locationHandle]/employees", "DELETE", { params: { locationHandle: location.id }, body: { employeeIds: [second.dbId] } });

    // ── Teams ──
    const team = (await step<{ team: { id: string } }>(
      "POST tenants/[tenant]/teams", "owner", "tenants/[tenant]/teams", "POST",
      { body: { name: "Service", locations: [location.name] } },
    )).team;
    await step("POST tenants/[tenant]/teams/[teamHandle]/members", "owner", "tenants/[tenant]/teams/[teamHandle]/members", "POST", { params: { teamHandle: team.id }, body: { employeeId: employee.dbId, role: "Kasse" } });
    await step("POST tenants/[tenant]/teams/[teamHandle]/members (2)", "owner", "tenants/[tenant]/teams/[teamHandle]/members", "POST", { params: { teamHandle: team.id }, body: { employeeId: second.dbId } });
    const teamDetail = await step<{ team: { members: Array<{ memberId: string; employeeId: string }> } }>(
      "GET tenants/[tenant]/teams/[teamHandle]", "owner", "tenants/[tenant]/teams/[teamHandle]", "GET", { params: { teamHandle: team.id } },
    );
    const [firstMember, secondMember] = teamDetail.team.members;
    await step("GET tenants/[tenant]/teams", "owner", "tenants/[tenant]/teams", "GET");
    await step("POST tenants/[tenant]/teams/[teamHandle]/lead", "owner", "tenants/[tenant]/teams/[teamHandle]/lead", "POST", { params: { teamHandle: team.id }, body: { memberId: firstMember.memberId } });
    await step("PATCH tenants/[tenant]/teams/[teamHandle]/members/[memberId]", "owner", "tenants/[tenant]/teams/[teamHandle]/members/[memberId]", "PATCH", { params: { teamHandle: team.id, memberId: secondMember.memberId }, body: { role: "Küche" } });
    await step("GET tenants/[tenant]/teams/[teamHandle]/assignable-employees", "owner", "tenants/[tenant]/teams/[teamHandle]/assignable-employees", "GET", { params: { teamHandle: team.id } });
    await step("DELETE tenants/[tenant]/teams/[teamHandle]/members/[memberId]", "owner", "tenants/[tenant]/teams/[teamHandle]/members/[memberId]", "DELETE", { params: { teamHandle: team.id, memberId: secondMember.memberId } });
    await step("PATCH tenants/[tenant]/teams/[teamHandle]", "owner", "tenants/[tenant]/teams/[teamHandle]", "PATCH", { params: { teamHandle: team.id }, body: { name: "Service", locations: [location.name] } });

    // ── Rollen ──
    await step("GET permission-config", "owner", "permission-config", "GET");
    const roles = await step<{ roles: Array<Record<string, unknown> & { id: string; name: string }> }>("GET tenants/[tenant]/roles", "owner", "tenants/[tenant]/roles", "GET");
    const template = roles.roles.find((role) => role.name.toLowerCase().includes("mitarbeiter")) ?? roles.roles[0];
    const roleBody = {
      name: `Vertragsrolle ${RUN_ID}`,
      description: "",
      permissions: template.permissions,
      scopes: template.scopes,
      canDelete: template.canDelete,
      canUploadFiles: template.canUploadFiles,
      canEditFiles: template.canEditFiles,
      canViewFiles: template.canViewFiles,
      canViewAudit: template.canViewAudit,
      shiftsLevel: template.shiftsLevel,
    };
    const role = (await step<{ role: { id: string } }>("POST tenants/[tenant]/roles", "owner", "tenants/[tenant]/roles", "POST", { body: roleBody })).role;
    await step("GET tenants/[tenant]/roles/[roleId]", "owner", "tenants/[tenant]/roles/[roleId]", "GET", { params: { roleId: role.id } });
    await step("PATCH tenants/[tenant]/roles/[roleId]", "owner", "tenants/[tenant]/roles/[roleId]", "PATCH", { params: { roleId: role.id }, body: roleBody });
    await step("DELETE tenants/[tenant]/roles/[roleId]", "owner", "tenants/[tenant]/roles/[roleId]", "DELETE", { params: { roleId: role.id } });

    // ── Schichten (Planung über /api/me/team-shifts) ──
    const shiftDate = isoDate(7);
    const { year, week } = isoWeek(shiftDate);
    const shift = (await step<{ shift: { id: string } }>(
      "POST me/team-shifts", "owner", "me/team-shifts", "POST",
      { body: { tenant: tenantSlug, date: shiftDate, startTime: "08:00", endTime: "16:00", breakMinutes: 30, employeeId: employee.dbId, locationId: location.dbId } },
    )).shift;
    await step("GET me/team-shifts", "owner", "me/team-shifts", "GET", { query: { tenant: tenantSlug, year: String(year), week: String(week) } });
    await step("PATCH me/team-shifts/[shiftId]", "owner", "me/team-shifts/[shiftId]", "PATCH", { params: { shiftId: shift.id }, body: { tenant: tenantSlug, date: shiftDate, startTime: "09:00", endTime: "17:00", breakMinutes: 30, employeeId: employee.dbId, locationId: location.dbId } });
    await step("POST me/team-shifts/publish", "owner", "me/team-shifts/publish", "POST", { body: { tenant: tenantSlug, year, week } });
    await step("GET me/shifts", "employee", "me/shifts", "GET", { query: { tenant: tenantSlug, year: String(year), week: String(week) } });
    await step("POST me/team-shifts/unpublish", "owner", "me/team-shifts/unpublish", "POST", { body: { tenant: tenantSlug, year, week } });
    await step("POST me/team-shifts/publish (2)", "owner", "me/team-shifts/publish", "POST", { body: { tenant: tenantSlug, year, week } });
    await step("POST me/team-shifts/reset", "owner", "me/team-shifts/reset", "POST", { body: { tenant: tenantSlug, year, week } });
    const extraShift = (await step<{ shift: { id: string } }>(
      "POST me/team-shifts (2)", "owner", "me/team-shifts", "POST",
      { body: { tenant: tenantSlug, date: shiftDate, startTime: "18:00", endTime: "22:00", locationId: location.dbId } },
    )).shift;
    await step("DELETE me/team-shifts/[shiftId]", "owner", "me/team-shifts/[shiftId]", "DELETE", { params: { shiftId: extraShift.id }, query: { tenant: tenantSlug } });

    // ── Urlaub ──
    const vacation = (await step<{ request: { id: string; dbId: string } }>(
      "POST tenants/[tenant]/vacation-requests", "owner", "tenants/[tenant]/vacation-requests", "POST",
      { body: { employeeId: employee.dbId, startDate: isoDate(30), endDate: isoDate(32), note: "Vertragstest" } },
    )).request;
    await step("GET tenants/[tenant]/vacation-requests", "owner", "tenants/[tenant]/vacation-requests", "GET");
    await step("PATCH tenants/[tenant]/vacation-requests/[requestId]", "owner", "tenants/[tenant]/vacation-requests/[requestId]", "PATCH", { params: { requestId: vacation.dbId }, body: { startDate: isoDate(30), endDate: isoDate(33) } });
    await step("POST tenants/[tenant]/vacation-requests/[requestId]/approve", "owner", "tenants/[tenant]/vacation-requests/[requestId]/approve", "POST", { params: { requestId: vacation.dbId } });
    const ownVacation = (await step<{ request: { id: string; dbId?: string } }>(
      "POST me/vacation-requests", "employee", "me/vacation-requests", "POST",
      { body: { tenant: tenantSlug, startDate: isoDate(isoWorkdayPairStart(60)), endDate: isoDate(isoWorkdayPairStart(60) + 1), note: "Eigener Antrag" } },
    )).request;
    await step("POST tenants/[tenant]/vacation-requests/[requestId]/reject", "owner", "tenants/[tenant]/vacation-requests/[requestId]/reject", "POST", { params: { requestId: ownVacation.dbId ?? ownVacation.id } });
    await step("DELETE tenants/[tenant]/vacation-requests/[requestId]", "owner", "tenants/[tenant]/vacation-requests/[requestId]", "DELETE", { params: { requestId: ownVacation.dbId ?? ownVacation.id } });

    // ── Wunschfrei ──
    await step("POST tenants/[tenant]/wish-free-requests", "owner", "tenants/[tenant]/wish-free-requests", "POST", { body: { employeeId: employee.dbId, date: isoDate(14), reason: "Termin" } });
    await step("GET tenants/[tenant]/wish-free-requests", "owner", "tenants/[tenant]/wish-free-requests", "GET", { query: { dates: `${isoDate(14)},${isoDate(15)}` } });
    const ownWish = (await step<{ request: { id: string; dbId?: string } }>("POST me/wish-free-requests", "employee", "me/wish-free-requests", "POST", { body: { tenant: tenantSlug, date: isoDate(20), reason: "Familie" } })).request;
    const ownWish2 = (await step<{ request: { id: string; dbId?: string } }>("POST me/wish-free-requests (2)", "employee", "me/wish-free-requests", "POST", { body: { tenant: tenantSlug, date: isoDate(21) } })).request;
    const ownWish3 = (await step<{ request: { id: string; dbId?: string } }>("POST me/wish-free-requests (3)", "employee", "me/wish-free-requests", "POST", { body: { tenant: tenantSlug, date: isoDate(22) } })).request;
    await step("GET me/wish-free-requests", "employee", "me/wish-free-requests", "GET", { query: { tenant: tenantSlug } });
    await step("POST tenants/[tenant]/wish-free-requests/[requestId]/approve", "owner", "tenants/[tenant]/wish-free-requests/[requestId]/approve", "POST", { params: { requestId: ownWish.dbId ?? ownWish.id }, body: {} });
    await step("POST tenants/[tenant]/wish-free-requests/[requestId]/reject", "owner", "tenants/[tenant]/wish-free-requests/[requestId]/reject", "POST", { params: { requestId: ownWish2.dbId ?? ownWish2.id }, body: { rejectReason: "Unterbesetzt" } });
    await step("DELETE me/wish-free-requests/[requestId]", "employee", "me/wish-free-requests/[requestId]", "DELETE", { params: { requestId: ownWish3.dbId ?? ownWish3.id }, query: { tenant: tenantSlug } });

    // ── Krankheit ──
    await step("POST me/sickness-reports", "employee", "me/sickness-reports", "POST", { body: { tenant: tenantSlug, startDate: isoDate(-2), note: "Erkältung" } });
    const sickness = await step<{ report: { id: string } }>("POST tenants/[tenant]/sickness-reports", "owner", "tenants/[tenant]/sickness-reports", "POST", { body: { employeeId: second.dbId, startDate: isoDate(-1), certificateStatus: "pending", reportChannel: "phone" } });
    await step("GET tenants/[tenant]/sickness-reports", "owner", "tenants/[tenant]/sickness-reports", "GET");
    await step("PATCH tenants/[tenant]/sickness-reports/[reportId]", "owner", "tenants/[tenant]/sickness-reports/[reportId]", "PATCH", { params: { reportId: sickness.report.id }, body: { startDate: isoDate(-1), note: "Rückmeldung per Telefon" } });
    await step("POST tenants/[tenant]/sickness-reports/[reportId]/close", "owner", "tenants/[tenant]/sickness-reports/[reportId]/close", "POST", { params: { reportId: sickness.report.id }, body: { endDate: isoDate(0) } });

    // ── Erinnerungen ──
    const reminder = await step<{ reminder: { id?: string; key?: string } }>("POST tenants/[tenant]/reminders", "owner", "tenants/[tenant]/reminders", "POST", { body: { title: "Probezeit endet", dueDate: isoDate(10), priority: "high" } });
    const reminders = await step<{ reminders: Array<{ id: string }> }>("GET tenants/[tenant]/reminders", "owner", "tenants/[tenant]/reminders", "GET");
    const reminderId = reminders.reminders[0]?.id ?? reminder.reminder.id ?? "";
    await step("PATCH tenants/[tenant]/reminders/[reminderId]", "owner", "tenants/[tenant]/reminders/[reminderId]", "PATCH", { params: { reminderId }, body: { title: "Probezeit endet bald", dueDate: isoDate(11), priority: "normal" } });
    await step("POST tenants/[tenant]/reminders/[reminderId]/complete", "owner", "tenants/[tenant]/reminders/[reminderId]/complete", "POST", { params: { reminderId } });
    await step("GET tenants/[tenant]/reminders/file-options", "owner", "tenants/[tenant]/reminders/file-options", "GET");

    // ── Info-Anfragen ──
    const infoRequest = (await step<{ infoRequest: { id: string } }>(
      "POST tenants/[tenant]/employees/[employeeHandle]/info-requests", "owner", "tenants/[tenant]/employees/[employeeHandle]/info-requests", "POST",
      { params: { employeeHandle: employee.id }, body: { title: "Steuer-ID nachreichen", message: "Bitte bis Monatsende.", fileRequested: false } },
    )).infoRequest;
    await step("GET tenants/[tenant]/info-requests", "owner", "tenants/[tenant]/info-requests", "GET");
    const answer = new FormData();
    answer.append("tenant", tenantSlug);
    answer.append("message", "Steuer-ID ist 12345678901.");
    await step("PATCH me/info-requests/[requestId]", "employee", "me/info-requests/[requestId]", "PATCH", { params: { requestId: infoRequest.id }, formData: answer });
    await step("PATCH tenants/[tenant]/info-requests/[requestId]", "owner", "tenants/[tenant]/info-requests/[requestId]", "PATCH", { params: { requestId: infoRequest.id }, body: { status: "cancelled" } });

    // ── Dateien (Datei-Zeilen direkt angelegt: Uploads gehen an S3) ──
    await step("POST tenants/[tenant]/files/folders", "owner", "tenants/[tenant]/files/folders", "POST", { body: { name: "Schulungen" } });
    await step("POST tenants/[tenant]/files/folders (Mitarbeiter)", "owner", "tenants/[tenant]/files/folders", "POST", { body: { ownerType: "employee", ownerId: employee.dbId, ownerName: "Erika Muster", name: "Zeugnisse" } });
    const employeeFile = await prisma.tenantFile.create({
      data: {
        tenantId,
        employeeId: employee.dbId,
        assignedEmployeeId: employee.dbId,
        assignedEmployeeName: "Erika Muster",
        storageKey: `contract/${RUN_ID}/zeugnis.pdf`,
        originalName: "zeugnis.pdf",
        displayName: "Zeugnis.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        extension: "pdf",
        folderSlug: "zeugnisse",
        folderName: "Zeugnisse",
        ownerName: "Erika Muster",
        documentType: "Zeugnis",
      },
    });
    await step("GET tenants/[tenant]/files", "owner", "tenants/[tenant]/files", "GET", { query: { path: "" } });
    await step("GET tenants/[tenant]/files (Mitarbeiter)", "owner", "tenants/[tenant]/files", "GET", { query: { ownerType: "employee", ownerId: employee.dbId } });
    await step("GET tenants/[tenant]/files/[fileId]/signed-url", "owner", "tenants/[tenant]/files/[fileId]/signed-url", "GET", { params: { fileId: employeeFile.id }, query: { disposition: "inline" } });
    await step("GET tenants/[tenant]/files/[fileId]/access-token", "owner", "tenants/[tenant]/files/[fileId]/access-token", "GET", { params: { fileId: employeeFile.id }, query: { disposition: "inline" } });
    await step("GET me/documents/[fileId]/download", "employee", "me/documents/[fileId]/download", "GET", { params: { fileId: employeeFile.id }, query: { tenant: tenantSlug } });
    await step("PATCH tenants/[tenant]/files/[fileId]", "owner", "tenants/[tenant]/files/[fileId]", "PATCH", { params: { fileId: employeeFile.id }, body: { hiddenFromEmployee: true } });
    await step("PATCH tenants/[tenant]/files/folders", "owner", "tenants/[tenant]/files/folders", "PATCH", { body: { employeeId: employee.dbId, path: "zeugnisse", ownerName: "Erika Muster", hiddenFromEmployee: false } });
    const deleted = await step<{ file: { deletionBatchId?: string } }>("DELETE tenants/[tenant]/files/[fileId]", "owner", "tenants/[tenant]/files/[fileId]", "DELETE", { params: { fileId: employeeFile.id } });
    await step("GET tenants/[tenant]/files/deleted", "owner", "tenants/[tenant]/files/deleted", "GET", { query: { ownerType: "employee", ownerId: employee.dbId } });
    await step("POST tenants/[tenant]/files/deleted/[batchId]", "owner", "tenants/[tenant]/files/deleted/[batchId]", "POST", { params: { batchId: deleted.file?.deletionBatchId ?? "none" } });
    await step("DELETE tenants/[tenant]/files/folders", "owner", "tenants/[tenant]/files/folders", "DELETE", { query: { path: "schulungen" } });

    // ── Verträge / Abrechnungen (Lesen + Statuswechsel; Upload geht an S3) ──
    await step("GET tenants/[tenant]/employees/[employeeHandle]/contracts", "owner", "tenants/[tenant]/employees/[employeeHandle]/contracts", "GET", { params: { employeeHandle: employee.id } });
    const contractFile = await prisma.tenantFile.create({
      data: { tenantId, employeeId: employee.dbId, storageKey: `contract/${RUN_ID}/vertrag.pdf`, originalName: "vertrag.pdf", displayName: "Vertrag.pdf", mimeType: "application/pdf", extension: "pdf", folderSlug: "vertraege", folderName: "Verträge" },
    });
    const contract = await prisma.tenantEmployeeContract.create({
      data: { tenantId, employeeId: employee.dbId, fileId: contractFile.id, title: "Arbeitsvertrag", startDate: isoDate(-400), status: "draft" },
    });
    await step("PATCH tenants/[tenant]/employees/[employeeHandle]/contracts/[contractId]", "owner", "tenants/[tenant]/employees/[employeeHandle]/contracts/[contractId]", "PATCH", { params: { employeeHandle: employee.id, contractId: contract.id }, body: { status: "active" } });
    await step("GET tenants/[tenant]/employees/[employeeHandle]/contracts (mit Vertrag)", "owner", "tenants/[tenant]/employees/[employeeHandle]/contracts", "GET", { params: { employeeHandle: employee.id } });
    const payrollFile = await prisma.tenantFile.create({
      data: { tenantId, employeeId: employee.dbId, storageKey: `contract/${RUN_ID}/lohn.pdf`, originalName: "lohn.pdf", displayName: "Lohn.pdf", mimeType: "application/pdf", extension: "pdf", folderSlug: "lohnabrechnungen", folderName: "Lohnabrechnungen" },
    });
    await prisma.tenantPayrollStatement.create({ data: { tenantId, employeeId: employee.dbId, fileId: payrollFile.id, period: "2026-09", gross: "3000", net: "2000" } });
    await step("GET tenants/[tenant]/employees/[employeeHandle]/payroll-statements", "owner", "tenants/[tenant]/employees/[employeeHandle]/payroll-statements", "GET", { params: { employeeHandle: employee.id } });
    await step("GET me/payroll-statements", "employee", "me/payroll-statements", "GET", { query: { tenant: tenantSlug } });

    // ── Self-Service der App ──
    await step("GET me/overview", "employee", "me/overview", "GET", { query: { tenant: tenantSlug } });
    await step("GET me/permissions", "employee", "me/permissions", "GET", { query: { tenant: tenantSlug } });
    await step("GET me/locations", "employee", "me/locations", "GET", { query: { tenant: tenantSlug } });
    await step("GET me/employees", "owner", "me/employees", "GET", { query: { tenant: tenantSlug } });
    await step("GET me/time-tracking", "employee", "me/time-tracking", "GET", { query: { tenant: tenantSlug } });
    await step("POST me/time-tracking clockIn", "employee", "me/time-tracking", "POST", { body: { tenant: tenantSlug, action: "clockIn" } });
    await step("POST me/time-tracking breakStart", "employee", "me/time-tracking", "POST", { body: { tenant: tenantSlug, action: "breakStart" } });
    await step("POST me/time-tracking breakEnd", "employee", "me/time-tracking", "POST", { body: { tenant: tenantSlug, action: "breakEnd" } });
    await step("POST me/time-tracking clockOut", "employee", "me/time-tracking", "POST", { body: { tenant: tenantSlug, action: "clockOut" } });
    await step("POST me/time-tracking clockOut (nicht eingestempelt)", "employee", "me/time-tracking", "POST", { body: { tenant: tenantSlug, action: "clockOut" }, expectStatus: 409 });
    await step("GET me/time-entries week", "employee", "me/time-entries", "GET", { query: { tenant: tenantSlug, period: "week" } });
    await step("GET me/time-entries month", "employee", "me/time-entries", "GET", { query: { tenant: tenantSlug, period: "month" } });
    await step("PATCH me/profile", "employee", "me/profile", "PATCH", { body: { tenant: tenantSlug, phone: "+49 170 7654321" } });
    await step("GET me/preferences", "employee", "me/preferences", "GET");
    await step("PATCH me/preferences", "employee", "me/preferences", "PATCH", { body: { language: "de" } });
    await step("GET me/account/deletion", "employee", "me/account/deletion", "GET");
    await step("POST me/account/deletion (ohne Passwort)", "employee", "me/account/deletion", "POST", { body: {}, expectStatus: 400 });
    await step("GET me/export", "employee", "me/export", "GET");
    await step("POST me/push-subscriptions", "employee", "me/push-subscriptions", "POST", { body: { token: `ExponentPushToken[${RUN_ID}]`, platform: "ios" } });
    await step("DELETE me/push-subscriptions", "employee", "me/push-subscriptions", "DELETE", { query: { token: `ExponentPushToken[${RUN_ID}]` } });

    const notification = await prisma.tenantEmployeeNotification.create({
      data: { tenantId, userId: users.employee, category: "shift", title: "Schichtplan veröffentlicht", detail: "KW", entityType: "shift-week", entityId: `${year}-W${week}` },
    });
    await step("GET me/notifications-feed", "employee", "me/notifications-feed", "GET", { query: { tenant: tenantSlug } });
    await step("POST me/notifications-feed/[id]/read", "employee", "me/notifications-feed/[id]/read", "POST", { params: { id: notification.id }, query: { tenant: tenantSlug } });
    await step("POST me/notifications-feed/read-all", "employee", "me/notifications-feed/read-all", "POST", { body: { tenant: tenantSlug } });

    // ── Konto ohne Personalakte (Owner) ──
    await step("GET me/overview (nicht verknüpft)", "owner", "me/overview", "GET", { query: { tenant: tenantSlug } });
    await step("GET me/time-tracking (nicht verknüpft)", "owner", "me/time-tracking", "GET", { query: { tenant: tenantSlug }, expectStatus: 409 });
    await step("GET me/employee-link/unlinked", "owner", "me/employee-link/unlinked", "GET", { query: { tenant: tenantSlug } });

    // ── Mitarbeiter-Rolle ohne eigene Akte: leere Liste statt Fehler ──
    await step("GET tenants/[tenant]/employees (Mitarbeiter-Rolle)", "colleague", "tenants/[tenant]/employees", "GET");

    // ── 2FA-Pflicht ──
    await prisma.tenantSettings.update({ where: { tenantId }, data: { twoFactorRequired: true } });
    const twoFactor = await step<{ error: string }>("GET me/overview (2FA-Pflicht)", "employee", "me/overview", "GET", { query: { tenant: tenantSlug }, expectStatus: 403 });
    expect(twoFactor.error).toBe("TWO_FACTOR_REQUIRED");
    await prisma.tenantSettings.update({ where: { tenantId }, data: { twoFactorRequired: false } });

    // ── Lebenszyklus Mitarbeiter (zuletzt, verändert den Bestand) ──
    await step("POST tenants/[tenant]/employees/[employeeHandle]/invite", "owner", "tenants/[tenant]/employees/[employeeHandle]/invite", "POST", { params: { employeeHandle: second.id } });
    await step("POST tenants/[tenant]/employees/[employeeHandle]/offboard", "owner", "tenants/[tenant]/employees/[employeeHandle]/offboard", "POST", { params: { employeeHandle: second.id }, body: { endDate: isoDate(0), reason: "Vertragsende" } });
    await step("POST tenants/[tenant]/employees/[employeeHandle]/reactivate", "owner", "tenants/[tenant]/employees/[employeeHandle]/reactivate", "POST", { params: { employeeHandle: second.id } });
    await step("POST me/employee-link (fremde Akte)", "colleague", "me/employee-link", "POST", { body: { tenant: tenantSlug, mode: "link", employeeId: second.dbId }, expectStatus: 403 });
    await step("POST me/employee-link (Owner wählt bestehende Akte)", "owner", "me/employee-link", "POST", { body: { tenant: tenantSlug, mode: "link", employeeId: second.dbId } });
    expect((await prisma.tenantEmployee.findUniqueOrThrow({ where: { id: second.dbId } })).userId).toBe(users.owner);
    const { unlinkOwnTenantEmployee } = await import("@/lib/employee-service");
    await unlinkOwnTenantEmployee(tenantSlug);
    await step("POST me/employee-link (neu anlegen)", "owner", "me/employee-link", "POST", { body: { tenant: tenantSlug, mode: "create", firstName: "Olivia", lastName: "Owner", email: `owner-${RUN_ID}@ployo.invalid` } });
    await step("DELETE tenants/[tenant]/teams/[teamHandle]", "owner", "tenants/[tenant]/teams/[teamHandle]", "DELETE", { params: { teamHandle: team.id } });
    await step("DELETE tenants/[tenant]/locations/[locationHandle]", "owner", "tenants/[tenant]/locations/[locationHandle]", "DELETE", { params: { locationHandle: location.id } });
    await step("DELETE tenants/[tenant]/employees/[employeeHandle] (Aufbewahrungsfrist)", "owner", "tenants/[tenant]/employees/[employeeHandle]", "DELETE", { params: { employeeHandle: second.id }, expectStatus: 409 });
    const third = (await step<{ employee: { id: string } }>(
      "POST tenants/[tenant]/employees (3)", "owner", "tenants/[tenant]/employees", "POST",
      { body: { firstName: "Tim", lastName: "Kurz", employeeNumber: `MA-${RUN_ID}-3`, startDate: isoDate(0) } },
    )).employee;
    await step("DELETE tenants/[tenant]/employees/[employeeHandle]", "owner", "tenants/[tenant]/employees/[employeeHandle]", "DELETE", { params: { employeeHandle: third.id } });

    // ── Abgleich mit dem gespeicherten Vertrag ──
    const current = Object.fromEntries([...recorded.entries()].sort(([a], [b]) => a.localeCompare(b)));

    if (UPDATE_CONTRACT || !existsSync(CONTRACT_FILE)) {
      mkdirSync(dirname(CONTRACT_FILE), { recursive: true });
      writeFileSync(CONTRACT_FILE, `${JSON.stringify(current, null, 2)}\n`);
      return;
    }

    const stored = JSON.parse(readFileSync(CONTRACT_FILE, "utf8")) as Record<string, ContractEntry>;
    const breaks: string[] = [];

    for (const [name, expected] of Object.entries(stored)) {
      const actual = current[name];
      if (!actual) {
        breaks.push(`${name}: Aufruf wird nicht mehr geprüft (Schritt fehlt im Test)`);
        continue;
      }
      if (actual.status !== expected.status) {
        breaks.push(`${name}: Status war ${expected.status}, ist jetzt ${actual.status}`);
      }
      findContractBreaks(expected.shape, actual.shape, name, breaks);
    }

    expect(breaks, "Die Mitarbeiter-App liest diese Felder – nicht entfernen oder umbenennen").toEqual([]);
  }, 60_000);
});
