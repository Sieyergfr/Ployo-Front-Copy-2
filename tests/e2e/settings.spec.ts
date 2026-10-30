import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_TENANT_SLUG, E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./fixture";

const prisma = new PrismaClient();
let tenantId: string;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  tenantId = (await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } })).id;
  await prisma.tenantSettings.create({ data: { tenantId } });
});
test.afterAll(async () => { await prisma.$disconnect(); });
test.beforeEach(async ({ context, baseURL }) => {
  const login = await context.request.post("/api/auth/sign-in/email", { headers: { Origin: baseURL! }, data: { email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD } });
  expect(login.ok()).toBe(true);
});

async function dismissCookies(page: import("@playwright/test").Page) {
  await page.getByRole("dialog", { name: "Cookie-Einstellungen" }).getByRole("button", { name: "Nur notwendige" }).click();
}

test("company settings save explicitly, use numeric hours and keep the identifier fixed", async ({ page }) => {
  await page.goto(`/u/${E2E_TENANT_SLUG}/einstellungen?kat=company`);
  await dismissCookies(page);
  const hours = page.locator('input[name="workHours"]');
  await expect(hours).toHaveAttribute("type", "number");
  await expect(page.locator('input[name="tenantId"]')).toHaveAttribute("readonly", "");
  await expect(page.locator('input[name="vacationDays"]')).toHaveValue("24");
  await expect(page.getByRole("switch", { name: /Personalnummer/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Rollen & Rechte/ })).toHaveCount(0);
  await hours.fill("38.5");
  await page.waitForTimeout(1300);
  expect((await prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId } })).workHours).toBe(40);
  // Tampering with a readonly HTML field must not change the tenant identifier server-side.
  await page.locator('input[name="tenantId"]').evaluate((element: HTMLInputElement) => { element.value = "should-not-rename"; });
  await page.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect.poll(async () => (await prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId } })).workHours).toBe(38.5);
  expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).slug).toBe(E2E_TENANT_SLUG);
  expect((await prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId } })).employeeNumberRequired).toBe(true);
});

test("opening hours can be applied to weekdays and only persist on Save", async ({ page }) => {
  await page.goto(`/u/${E2E_TENANT_SLUG}/einstellungen?kat=shifts`);
  await dismissCookies(page);
  await page.getByText("Mehrere Tage gemeinsam bearbeiten", { exact: true }).click();
  await page.getByLabel("Öffnet um", { exact: true }).fill("08:00");
  await page.getByLabel("Schließt um", { exact: true }).fill("16:30");
  await page.getByRole("button", { name: "Für 5 Tage übernehmen", exact: true }).click();
  const form = page.locator('form').filter({ has: page.locator('input[name="defaultOpeningHours"]') });
  const draft = JSON.parse(await form.locator('input[name="defaultOpeningHours"]').inputValue());
  expect(draft.filter((day: { mode: string }) => day.mode === "custom")).toHaveLength(5);
  await page.waitForTimeout(1300);
  expect((await prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId } })).defaultOpeningHoursJson).toEqual([]);
  await form.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect.poll(async () => (await prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId } })).defaultOpeningHoursJson).toEqual(draft);
});

test("removed options stay hidden and date format changes real date fields after Save", async ({ page }) => {
  await page.goto(`/u/${E2E_TENANT_SLUG}/einstellungen?kat=account`);
  await dismissCookies(page);
  await expect(page.locator('[name="timezone"], [name="startPage"], [name="pushEnabled"]')).toHaveCount(0);
  const format = page.getByRole("radio", { name: "JJJJ-MM-TT", exact: true });
  const form = page.locator("form").filter({ has: format });
  await format.click();
  await form.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect(form.getByRole("button", { name: "Änderungen speichern", exact: true })).toBeDisabled();
  await page.goto(`/u/${E2E_TENANT_SLUG}/employees`);
  await page.getByRole("button", { name: "Mitarbeiter anlegen", exact: true }).click();
  const date = page.getByRole("dialog", { name: "Neue Person", exact: true }).locator('input[role="combobox"]');
  await date.fill("29.10.2026");
  await date.press("Tab");
  await expect(date).toHaveValue("2026-10-29");
});

test("notification, billing, clock-in and integration options match available features", async ({ page }) => {
  await page.goto(`/u/${E2E_TENANT_SLUG}/einstellungen?kat=notifications`);
  await dismissCookies(page);
  await expect(page.locator('[name="mobilePush"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Wöchentlicher Digest", exact: true })).toBeVisible();
  await page.goto(`/u/${E2E_TENANT_SLUG}/einstellungen?kat=timeTracking`);
  const clockLabel = await page.getByText("Einstempeln möglich", { exact: true }).boundingBox();
  const clockOptions = await page.getByRole("radiogroup", { name: "Einstempeln möglich", exact: true }).boundingBox();
  expect(clockOptions!.y).toBeGreaterThan(clockLabel!.y + clockLabel!.height);
  await expect(page.locator('[name="timeTrackingReminderPush"]')).toHaveCount(0);
  await page.goto(`/u/${E2E_TENANT_SLUG}/einstellungen?kat=billing`);
  await expect(page.locator('select[name="paymentInterval"]')).toHaveCount(0);
  await expect(page.getByText("Abrechnungsintervall", { exact: true })).toHaveCount(0);
  await page.goto(`/u/${E2E_TENANT_SLUG}/einstellungen?kat=integrations`);
  await expect(page.getByText(/Dokumente & Unterschriften/)).toContainText("Bald verfügbar");
});


test("standard shift colors are saved explicitly and survive reload", async ({ page }) => {
  await page.goto(`/u/${E2E_TENANT_SLUG}/einstellungen?kat=shifts`);
  await dismissCookies(page);
  const form = page.locator("form").filter({ has: page.locator('input[name="presets"]') });
  await form.getByRole("button", { name: /Standardschicht hinzufügen/ }).click();
  const color = form.getByLabel("Schichtfarbe", { exact: true }).last();
  await color.fill("#159a63");
  await expect(form.getByRole("button", { name: "Änderungen speichern", exact: true })).toBeEnabled();
  expect((await prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId } })).shiftPresetsJson).toEqual([]);
  await form.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect.poll(async () => {
    const presets = (await prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId } })).shiftPresetsJson as { color: string }[];
    return presets.at(-1)?.color;
  }).toBe("#159a63");
  await page.reload();
  await expect(page.getByLabel("Schichtfarbe", { exact: true }).last()).toHaveValue("#159a63");
});
