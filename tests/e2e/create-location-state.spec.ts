import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_TENANT_SLUG, E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./fixture";

test("location validation keeps every submitted field and allows correction", async ({ page, context, baseURL }) => {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
    await prisma.tenantEmployee.create({ data: { tenantId: tenant.id, key: "location-lead-state", name: "Test Standortleitung", initials: "TS", employeeNumber: "LOC-STATE" } });
    const login = await context.request.post("/api/auth/sign-in/email", { headers: { Origin: baseURL! }, data: { email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD } });
    expect(login.ok()).toBe(true);
    await page.goto(`/u/${E2E_TENANT_SLUG}/standorte?create=1`);
    await page.getByRole("dialog", { name: "Cookie-Einstellungen" }).getByRole("button", { name: "Nur notwendige" }).click();
    const drawer = page.getByRole("dialog", { name: /Standort anlegen/ });
    await expect(drawer).toBeVisible();
    await drawer.locator('input[name="name"]').fill("Standort mit erhaltenen Eingaben");
    await drawer.getByRole("radio", { name: "Lager", exact: true }).click();
    await drawer.getByRole("radio", { name: "Inaktiv", exact: true }).click();
    await drawer.getByRole("radio", { name: "Violett", exact: true }).click();
    for (const [name, value] of Object.entries({ careOf: "Testfirma", street: "Teststraße", houseNumber: "17a", postalCode: "123", city: "Berlin", email: "standort-state@example.com", shiftMinStaffing: "4" })) {
      await drawer.locator(`input[name="${name}"]`).fill(value);
    }
    await drawer.getByRole("combobox", { name: /^Bundesland/ }).selectOption("BE");
    await drawer.getByRole("button", { name: /Mitarbeiter auswählen/ }).click();
    await page.getByRole("option", { name: /Test Standortleitung/ }).click();
    await drawer.getByRole("checkbox", { name: "Eigene Öffnungszeiten für diesen Standort festlegen" }).check();
    await drawer.getByRole("combobox", { name: "Montag Modus", exact: true }).selectOption("custom");
    await drawer.getByLabel("Montag Beginn 1", { exact: true }).fill("07:30");
    const form = drawer.locator("#create-location-form");
    const before = await form.evaluate((element: HTMLFormElement) => Array.from(new FormData(element).entries()));
    await drawer.getByRole("button", { name: "Standort erstellen", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText(/Postleitzahl/);
    await expect(drawer.getByRole("button", { name: "Standort erstellen", exact: true })).toBeEnabled();
    const after = await form.evaluate((element: HTMLFormElement) => Array.from(new FormData(element).entries()));
    expect(after).toEqual(before);
    await drawer.locator('input[name="postalCode"]').fill("10115");
    await drawer.getByRole("button", { name: "Standort erstellen", exact: true }).click();
    await page.waitForURL(new RegExp(`/u/${E2E_TENANT_SLUG}/standorte/[^?]+$`));
    const location = await prisma.tenantLocation.findFirstOrThrow({ where: { tenantId: tenant.id, name: "Standort mit erhaltenen Eingaben" }, include: { address: true } });
    expect(location).toMatchObject({ kind: "Lager", status: "inactive", contactEmail: "standort-state@example.com", leadName: "Test Standortleitung", accentClassName: "bg-[#8B6ED4]", shiftMinStaffing: 4, bundesland: "BE", address: { street: "Teststraße", houseNumber: "17a", postalCode: "10115", city: "Berlin", careOf: "Testfirma" } });
  } finally {
    await prisma.$disconnect();
  }
});
