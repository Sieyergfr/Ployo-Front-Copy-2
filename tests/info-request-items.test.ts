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

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-info-items-${RUN_ID}`;

let tenantId: string;
let ownerUserId: string;
let employeeUserId: string;
let employeeId: string;

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
  ownerUserId = owner.id;
  employeeUserId = employeeUser.id;

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: ownerUserId, role: "OWNER" },
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
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { slug: tenantSlug } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, employeeUserId] } } });
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
