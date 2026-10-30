import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_TENANT_SLUG, E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./fixture";

const prisma = new PrismaClient();
const handle = "e2e-info-draft-person";
test.beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  await prisma.tenantEmployee.create({ data: { tenantId: tenant.id, key: handle, name: "Entwurf Testperson", initials: "ET", employeeNumber: "E2E-INFO" } });
});
test.afterAll(async () => { await prisma.$disconnect(); });

test("restores an app draft in the web editor, saves changes and sends the complete request", async ({ page, context, baseURL }) => {
  const login = await context.request.post("/api/auth/sign-in/email", { headers: { Origin: baseURL! }, data: { email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD } });
  expect(login.ok()).toBe(true);
  const path = `/api/tenants/${E2E_TENANT_SLUG}/employees/${handle}/info-requests`;
  // Same JSON contract as the app, including multiple required/optional positions.
  const draft = await context.request.patch(`${path}/draft`, { data: {
    title: "Unterlagen Entwurf", message: "Aus der App", dueAt: "2027-04-30", dueTime: "14:30",
    items: [{ kind: "document", label: "Ausweis", required: true }, { kind: "field", label: "IBAN", required: false }],
  } });
  expect(draft.ok()).toBe(true);
  await page.goto(`/u/${E2E_TENANT_SLUG}/employees/${handle}?tab=requests`);
  await page.getByRole("dialog", { name: "Cookie-Einstellungen" }).getByRole("button", { name: "Nur notwendige" }).click();
  const open = () => page.getByRole("button", { name: "Info anfragen", exact: true }).first().click();
  await open();
  const popup = page.getByRole("dialog", { name: "Info anfragen", exact: true });
  await expect(popup.getByText("Ihr gespeicherter Entwurf wurde wiederhergestellt.")).toBeVisible();
  await expect(popup.getByLabel("Benötigte Information")).toHaveValue("Unterlagen Entwurf");
  await expect(popup.getByLabel("Bezeichnung", { exact: true }).nth(0)).toHaveValue("Ausweis");
  await expect(popup.getByLabel("Bezeichnung", { exact: true }).nth(1)).toHaveValue("IBAN");
  await expect(popup.locator('input[name="dueTime"]')).toHaveValue("14:30");
  await popup.getByLabel("Nachricht", { exact: true }).fill("Im Web ergänzt");
  await popup.getByRole("button", { name: "Als Entwurf speichern", exact: true }).click();
  await expect(popup).toHaveCount(0);
  const saved = await context.request.get(`${path}/draft`);
  expect((await saved.json()).draft.content.message).toBe("Im Web ergänzt");
  expect(await prisma.tenantEmployeeInfoRequest.count({ where: { employee: { key: handle } } })).toBe(0);
  await open();
  await expect(popup.getByLabel("Nachricht", { exact: true })).toHaveValue("Im Web ergänzt");
  await popup.getByRole("button", { name: "Anfrage speichern", exact: true }).click();
  await expect(popup).toHaveCount(0);
  const sent = await prisma.tenantEmployeeInfoRequest.findFirstOrThrow({ where: { employee: { key: handle } }, include: { items: { orderBy: { position: "asc" } } } });
  expect(sent.message).toBe("Im Web ergänzt");
  expect(sent.items.map(({ kind, label, required }) => ({ kind, label, required }))).toEqual([
    { kind: "document", label: "Ausweis", required: true }, { kind: "field", label: "IBAN", required: false },
  ]);
  expect((await (await context.request.get(`${path}/draft`)).json()).draft).toBeNull();
});

test("reminder action reports an unlinked account, shows success and is hidden for closed requests", async ({ page, context, baseURL }) => {
  const employee = await prisma.tenantEmployee.findFirstOrThrow({ where: { key: handle, tenant: { slug: E2E_TENANT_SLUG } } });
  const request = await prisma.tenantEmployeeInfoRequest.create({ data: { tenantId: employee.tenantId, employeeId: employee.id, title: "Erinnerungstest", requestedBy: "E2E" } });
  const login = await context.request.post("/api/auth/sign-in/email", { headers: { Origin: baseURL! }, data: { email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD } });
  expect(login.ok()).toBe(true);
  await page.goto(`/u/${E2E_TENANT_SLUG}/employees/${handle}?tab=requests`);
  await page.getByRole("dialog", { name: "Cookie-Einstellungen" }).getByRole("button", { name: "Nur notwendige" }).click();
  const open = () => page.getByRole("button").filter({ has: page.getByText("Erinnerungstest", { exact: true }) }).click();
  await open();
  const drawer = page.getByRole("dialog", { name: "Erinnerungstest", exact: true });
  const failedDelivery = page.waitForResponse((response) => response.url().endsWith(`/info-requests/${request.id}/remind`));
  await drawer.getByRole("button", { name: "An Anfrage erinnern", exact: true }).click();
  expect((await failedDelivery).status()).toBe(409);
  await expect(page.getByText(/Für diesen Mitarbeiter ist noch kein Konto verknüpft/)).toBeVisible();
  // Success UI uses a mocked delivery response; this browser test never sends a message.
  let calls = 0;
  await page.route(`**/api/tenants/${E2E_TENANT_SLUG}/info-requests/${request.id}/remind`, async (route) => {
    expect(route.request().method()).toBe("POST"); calls++;
    await route.fulfill({ json: { sentAt: new Date().toISOString(), channels: ["in-app"] } });
  });
  await drawer.getByRole("button", { name: "An Anfrage erinnern", exact: true }).click();
  await expect(drawer.getByRole("button", { name: "Erinnerung gesendet", exact: true })).toBeDisabled();
  expect(calls).toBe(1);
  await page.keyboard.press("Escape");
  await prisma.tenantEmployeeInfoRequest.update({ where: { id: request.id }, data: { status: "review" } });
  await page.reload();
  await open();
  await expect(drawer.getByRole("button", { name: "An Anfrage erinnern", exact: true })).toHaveCount(0);
});
