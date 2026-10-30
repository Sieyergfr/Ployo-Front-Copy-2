import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  deriveInfoRequestTitle,
  infoRequestItemsComplete,
  legacyInfoRequestMessage,
  legacyResponseTargets,
  normalizeInfoRequestItems,
} from "@/lib/info-request-items";

/**
 * Mehrteilige Info-Anfragen (M7) gegen eine echte Datenbank: Anlegen mit
 * Elementen, Antwort je Element und die Übergangslösung für die alte App
 * (TODO(app-multi-item-requests)).
 */

let currentUserId = "";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: currentUserId, name: "Test Actor", email: "actor@test.invalid" },
      }),
    },
  },
}));

vi.mock("@/lib/notifications/dispatch", () => ({
  dispatchNotification: async () => undefined,
}));

vi.mock("@/lib/storage/upload", () => ({
  uploadObject: async (input: { key: string }) => ({ bucket: "test", key: input.key, provider: "test" }),
}));

const employees = await import("@/lib/employee-service");
const selfService = await import("@/lib/self-service");
const drafts = await import("@/lib/info-request-drafts");
const draftRoute = await import("@/app/api/tenants/[tenant]/employees/[employeeHandle]/info-requests/draft/route");

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-info-items-${RUN_ID}`;

let tenantId: string;
let ownerUserId: string;
let employeeUserId: string;
let employeeId: string;
let secondOwnerId: string;

function pdf(name: string) {
  return new File([new TextEncoder().encode("%PDF-1.4\n%test\n")], name, { type: "application/pdf" });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: `Anfragen ${RUN_ID}` } });
  tenantId = tenant.id;

  const [owner, employeeUser] = await Promise.all(
    ["owner", "employee"].map((name) =>
      prisma.user.create({ data: { email: `${name}-items-${RUN_ID}@ployo.invalid`, name, emailVerified: true } }),
    ),
  );
  const secondOwner = await prisma.user.create({ data: { email: `second-owner-items-${RUN_ID}@ployo.invalid`, name: "Other owner", emailVerified: true } });
  secondOwnerId = secondOwner.id;
  ownerUserId = owner.id;
  employeeUserId = employeeUser.id;

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: ownerUserId, role: "OWNER" },
      { tenantId, userId: secondOwnerId, role: "OWNER" },
      { tenantId, userId: employeeUserId, role: "EMPLOYEE" },
    ],
  });

  const employee = await prisma.tenantEmployee.create({
    data: { tenantId, key: `emp-${RUN_ID}`, employeeNumber: `I-${RUN_ID}`, userId: employeeUserId, initials: "EM", name: "Erika Muster" },
  });
  employeeId = employee.id;
});

beforeEach(async () => {
  currentUserId = ownerUserId;
  await prisma.tenantEmployeeInfoRequest.deleteMany({ where: { tenantId } });
  await prisma.tenantInfoRequestDraft.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { slug: tenantSlug } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, employeeUserId, secondOwnerId] } } });
  await prisma.$disconnect();
});

describe("Regeln", () => {
  it("normalisiert Elemente und leitet den Titel ab", () => {
    const items = normalizeInfoRequestItems([
      { kind: "document", label: " Personalausweis " },
      { kind: "field", label: "Steuer-ID", required: false },
      { label: "  " },
      { kind: "field", label: "IBAN" },
    ]);

    expect(items).toEqual([
      { kind: "document", label: "Personalausweis", required: true },
      { kind: "field", label: "Steuer-ID", required: false },
      { kind: "field", label: "IBAN", required: true },
    ]);
    expect(deriveInfoRequestTitle("", items)).toBe("Personalausweis, Steuer-ID +1");
    expect(deriveInfoRequestTitle("Eigener Titel", items)).toBe("Eigener Titel");
  });

  it("ordnet Antworten der alten App dem ersten offenen Element zu", () => {
    const items = [
      { id: "a", kind: "field" as const, status: "provided" as const },
      { id: "b", kind: "field" as const, status: "open" as const },
      { id: "c", kind: "document" as const, status: "open" as const },
    ];

    expect(legacyResponseTargets(items, { hasFile: true, hasMessage: true })).toEqual({ fileItemId: "c", fieldItemId: "b" });
    expect(legacyResponseTargets(items, { hasFile: false, hasMessage: true })).toEqual({ fileItemId: null, fieldItemId: "b" });
    expect(infoRequestItemsComplete([{ required: true, status: "provided" }, { required: false, status: "open" }])).toBe(true);
    expect(infoRequestItemsComplete([{ required: true, status: "open" }])).toBe(false);
    expect(
      legacyInfoRequestMessage("Bitte bis Freitag.", [
        { kind: "document", label: "Ausweis", required: true, status: "open" },
        { kind: "field", label: "IBAN", required: false, status: "provided" },
      ]),
    ).toBe("Bitte bis Freitag.\n\nBenötigt:\n• Ausweis (Dokument)\n• IBAN (Angabe, optional) ✓");
  });
});

describe("Mehrteilige Anfrage", () => {
  it("legt Elemente an und schließt die Anfrage, wenn alle Pflicht-Elemente beantwortet sind", async () => {
    const created = await employees.createEmployeeInfoRequest({
      tenantSlug,
      employeeId,
      title: "",
      fileRequested: false,
      items: [
        { kind: "document", label: "Personalausweis" },
        { kind: "field", label: "Steuer-ID" },
        { kind: "field", label: "Zweitname", required: false },
      ],
    });

    expect(created.title).toBe("Personalausweis, Steuer-ID +1");
    // Für die alte App: Pflicht-Dokument ⇒ Datei erforderlich.
    expect(created.fileRequested).toBe(true);

    currentUserId = employeeUserId;
    const overview = await selfService.getMySelfServiceOverview(tenantSlug);
    const request = overview.infoRequests.find((entry) => entry.id === created.id)!;

    expect(request.items?.map((item) => item.label)).toEqual(["Personalausweis", "Steuer-ID", "Zweitname"]);
    expect(request.message).toContain("• Personalausweis (Dokument)");

    const [idCard, taxId] = request.items!;

    await expect(
      selfService.submitMyInfoRequestItem({ tenantSlug, requestId: created.id, itemId: taxId.id, value: " " }),
    ).rejects.toThrow("Bitte eine Angabe machen.");

    let result = await selfService.submitMyInfoRequestItem({ tenantSlug, requestId: created.id, itemId: taxId.id, value: "12345678901" });

    expect(result.status).toBe("open");

    result = await selfService.submitMyInfoRequestItem({ tenantSlug, requestId: created.id, itemId: idCard.id, file: pdf("ausweis.pdf") });

    expect(result.status).toBe("uploaded");
    expect(result.items?.find((item) => item.id === idCard.id)).toMatchObject({ status: "provided", fileName: "ausweis.pdf" });

    currentUserId = ownerUserId;
    const tenantRequests = await employees.getInfoRequestsForTenant(tenantSlug);

    expect(tenantRequests[0].items?.find((item) => item.label === "Steuer-ID")?.value).toBe("12345678901");
  });

  it("ordnet eine Antwort aus der alten App dem ersten offenen Element zu", async () => {
    const created = await employees.createEmployeeInfoRequest({
      tenantSlug,
      employeeId,
      title: "Unterlagen",
      fileRequested: false,
      items: [
        { kind: "field", label: "IBAN" },
        { kind: "document", label: "Gesundheitszeugnis" },
      ],
    });

    currentUserId = employeeUserId;
    const result = await selfService.submitInfoRequestResponse({
      tenantSlug,
      requestId: created.id,
      message: "DE00 1234",
      file: pdf("zeugnis.pdf"),
    });

    expect(result.status).toBe("uploaded");
    expect(result.items?.map((item) => [item.label, item.status, item.value])).toEqual([
      ["IBAN", "provided", "DE00 1234"],
      ["Gesundheitszeugnis", "provided", ""],
    ]);
  });

  it("bleibt für klassische Anfragen ohne Elemente unverändert", async () => {
    const created = await employees.createEmployeeInfoRequest({
      tenantSlug,
      employeeId,
      title: "Adresse prüfen",
      message: "Stimmt die Adresse noch?",
      fileRequested: false,
    });

    currentUserId = employeeUserId;
    const result = await selfService.submitInfoRequestResponse({ tenantSlug, requestId: created.id, message: "Ja" });

    expect(result).toMatchObject({ message: "Stimmt die Adresse noch?", status: "review", responseMessage: "Ja", items: [] });
  });
});


describe("Persönliche Info-Anfragen-Entwürfe", () => {
  const handle = `emp-${RUN_ID}`;
  const content = {
    title: "Unterlagen für den Start", message: "Bitte ergänzen.", dueAt: "2027-04-30", dueTime: "14:30",
    items: [{ kind: "document" as const, label: "Ausweis", required: true }, { kind: "field" as const, label: "IBAN", required: false }],
  };

  it("speichert und lädt unvollständige Entwürfe ohne Versand und trennt Autoren", async () => {
    expect(await drafts.getInfoRequestDraft(tenantSlug, handle)).toBeNull();
    await drafts.saveInfoRequestDraft(tenantSlug, handle, content);
    expect(await prisma.tenantEmployeeInfoRequest.count({ where: { tenantId } })).toBe(0);
    expect((await drafts.getInfoRequestDraft(tenantSlug, handle))?.content).toMatchObject(content);
    currentUserId = secondOwnerId;
    expect(await drafts.getInfoRequestDraft(tenantSlug, handle)).toBeNull();
    await drafts.saveInfoRequestDraft(tenantSlug, handle, { title: "Anderer Entwurf" });
    await drafts.deleteInfoRequestDraft(tenantSlug, handle);
    currentUserId = ownerUserId;
    expect((await drafts.getInfoRequestDraft(tenantSlug, handle))?.content.title).toBe(content.title);
    await drafts.saveInfoRequestDraft(tenantSlug, handle, { message: "Noch ohne Titel und Positionen" });
    expect((await drafts.getInfoRequestDraft(tenantSlug, handle))?.content.title).toBe("");
  });

  it("verweigert normalen Mitarbeitern und fremden Mandanten Zugriff", async () => {
    currentUserId = employeeUserId;
    await expect(drafts.getInfoRequestDraft(tenantSlug, handle)).rejects.toThrow();
    await expect(drafts.saveInfoRequestDraft(tenantSlug, handle, content)).rejects.toThrow();
    await expect(drafts.deleteInfoRequestDraft(tenantSlug, handle)).rejects.toThrow();
    currentUserId = ownerUserId;
    await expect(drafts.getInfoRequestDraft(`missing-${RUN_ID}`, handle)).rejects.toThrow();
    await expect(drafts.saveInfoRequestDraft(tenantSlug, "unknown-employee", content)).rejects.toThrow("Mitarbeiter nicht gefunden.");
  });

  it("entfernt nach Versand nur den Entwurf des versendenden Autors", async () => {
    await drafts.saveInfoRequestDraft(tenantSlug, handle, content);
    currentUserId = secondOwnerId;
    await drafts.saveInfoRequestDraft(tenantSlug, handle, { title: "Behalten" });
    currentUserId = ownerUserId;
    const request = await employees.createEmployeeInfoRequest({ tenantSlug, employeeId, ...content, fileRequested: false });
    expect(request.title).toBe(content.title);
    expect(request.dueAt?.getHours()).toBe(14);
    expect(await drafts.getInfoRequestDraft(tenantSlug, handle)).toBeNull();
    currentUserId = secondOwnerId;
    expect((await drafts.getInfoRequestDraft(tenantSlug, handle))?.content.title).toBe("Behalten");
  });

  it("prüft den API-Vertrag für Laden, Speichern, Löschen und nicht angemeldete Nutzer", async () => {
    const context = { params: Promise.resolve({ tenant: tenantSlug, employeeHandle: handle }) };
    const url = "http://localhost/api/draft";
    let response = await draftRoute.PATCH(new Request(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(content) }), context);
    expect(response.status).toBe(200);
    expect((await response.json()).draft.content.items).toEqual(content.items);
    response = await draftRoute.GET(new Request(url), context);
    expect((await response.json()).draft.content.dueTime).toBe("14:30");
    response = await draftRoute.DELETE(new Request(url, { method: "DELETE" }), context);
    expect(response.status).toBe(200);
    response = await draftRoute.GET(new Request(url), context);
    expect((await response.json()).draft).toBeNull();
    response = await draftRoute.PATCH(new Request(url, { method: "PATCH", body: "not-json" }), context);
    expect(response.status).toBe(400);
    currentUserId = "";
    response = await draftRoute.GET(new Request(url), context);
    expect(response.status).toBe(401);
  });

  it("begrenzt und normalisiert Inhalte ohne ungültige Eingaben zu übernehmen", () => {
    const result = drafts.normalizeInfoRequestDraft({ title: "x".repeat(300), message: "x".repeat(11000), dueAt: "bad", dueTime: "99:99", items: [null, { label: 3 }, ...Array.from({ length: 30 }, () => ({ label: " Test ", kind: "field", required: false }))] });
    expect(result.title).toHaveLength(240);
    expect(result.message).toHaveLength(10000);
    expect(result.items).toHaveLength(20);
    expect(result.items[0]).toEqual({ kind: "field", label: "Test", required: false });
    expect(result.dueAt).toBe("");
    expect(result.dueTime).toBe("");
  });
});
