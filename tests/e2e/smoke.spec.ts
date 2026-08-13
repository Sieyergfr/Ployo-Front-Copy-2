import { expect, test } from "@playwright/test";
import {
  E2E_TENANT_NAME,
  E2E_USER_EMAIL,
  E2E_USER_PASSWORD,
} from "./fixture";

test.describe.configure({ mode: "serial" });

test("Login → Dashboard → Mitarbeiter anlegen", async ({ page }) => {
  await test.step("Login", async () => {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill(E2E_USER_EMAIL);
    await page.getByLabel("Passwort", { exact: true }).fill(E2E_USER_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();

    await page.waitForURL(/\/select|\/u\//, { timeout: 30_000 });
  });

  await test.step("Mandant auswählen", async () => {
    if (page.url().includes("/select")) {
      await page.getByText(E2E_TENANT_NAME).click();
    }

    await page.waitForURL(/\/u\/e2e-smoke-test/, { timeout: 30_000 });
    await expect(
      page.getByRole("navigation", { name: "Hauptnavigation" }),
    ).toBeVisible();
  });

  await test.step("Zur Mitarbeiterliste wechseln", async () => {
    await page.getByRole("link", { name: "Mitarbeiter" }).first().click();
    await page.waitForURL(/\/employees$/);
    await expect(page.getByRole("heading", { name: "Mitarbeiter" })).toBeVisible();
  });

  await test.step("Mitarbeiter anlegen", async () => {
    await page.getByRole("button", { name: "Anlegen" }).click();

    const popup = page.getByRole("dialog");
    await expect(popup.getByText("Mitarbeiter anlegen")).toBeVisible();

    await popup.getByLabel("Vorname").fill("Playwright");
    await popup.getByLabel("Nachname").fill("Smoketest");
    await popup.getByLabel("E-Mail-Adresse").fill("playwright.smoketest@ployo.invalid");

    await popup.getByRole("button", { name: "Anlegen" }).click();

    await page.waitForURL(/\/employees\/[^/]+$/, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Playwright Smoketest" }),
    ).toBeVisible();
  });
});
