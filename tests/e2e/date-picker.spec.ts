import { expect, test } from "@playwright/test";
import { E2E_TENANT_SLUG, E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./fixture";

test("employee popup fits narrow screens and uses the shared calendar", async ({ page, context, baseURL }) => {
  const response = await context.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL! },
    data: { email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD },
  });
  expect(response.ok()).toBe(true);
  await page.goto(`/u/${E2E_TENANT_SLUG}/employees`);
  await page.getByRole("dialog", { name: "Cookie-Einstellungen" })
    .getByRole("button", { name: "Nur notwendige" }).click();
  await page.getByRole("button", { name: "Mitarbeiter anlegen", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Neue Person", exact: true });
  await expect(popup).toBeVisible();

  for (const width of [1280, 540, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const size = await popup.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(size.scroll).toBeLessThanOrEqual(size.client);
  }

  const date = popup.locator('input[role="combobox"]');
  const submittedDate = popup.locator('input[type="hidden"][name="startDate"]');
  await date.fill("31.02.2026");
  expect(await date.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(false);
  await date.fill("29.10.2026");
  await date.press("Tab");
  await expect(submittedDate).toHaveValue("2026-10-29");
  expect(await date.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);

  await popup.getByRole("button", { name: "Kalender öffnen" }).click();
  const calendar = page.getByRole("dialog", { name: "Datum auswählen", exact: true });
  await expect(calendar).toBeVisible();
  const bounds = (await calendar.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);

  await calendar.getByRole("button", { name: "29.10.2026", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(calendar.getByRole("button", { name: "30.10.2026", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(submittedDate).toHaveValue("2026-10-30");

  await popup.getByRole("button", { name: "Kalender öffnen" }).click();
  await calendar.getByRole("button", { name: "Leeren", exact: true }).click();
  await expect(submittedDate).toHaveValue("");
  await popup.getByRole("button", { name: "Kalender öffnen" }).click();
  await calendar.getByRole("button", { name: "Heute", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(popup).toBeVisible();
});
