import { expect, test } from "@playwright/test";
import { E2E_TENANT_SLUG, E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./fixture";

test("collapsed sidebar icons share the same center with and without scrolling", async ({ page, context, baseURL }) => {
  const login = await context.request.post("/api/auth/sign-in/email", { headers: { Origin: baseURL! }, data: { email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD } });
  expect(login.ok()).toBe(true);
  await page.goto(`/u/${E2E_TENANT_SLUG}`);
  await page.getByRole("dialog", { name: "Cookie-Einstellungen" }).getByRole("button", { name: "Nur notwendige" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Navigation einklappen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Navigation ausklappen", exact: true })).toBeVisible();
  const sidebar = page.getByRole("complementary", { name: "Seitenleiste" });
  for (const height of [650, 1200]) {
    await page.setViewportSize({ width: 1280, height });
    await expect(sidebar).toHaveCSS("width", "76px");
    const bounds = (await sidebar.boundingBox())!;
    const center = bounds.x + bounds.width / 2;
    const icons = sidebar.locator('nav .db-item > svg, a[aria-label="Ployo"] img, button[aria-label="Navigation ausklappen"] > svg, .db-search > svg, .db-row > span:first-child, .db-item-c > svg');
    expect(await icons.count()).toBeGreaterThan(5);
    for (const icon of await icons.all()) {
      const rect = (await icon.boundingBox())!;
      expect(Math.abs(rect.x + rect.width / 2 - center)).toBeLessThanOrEqual(1);
    }
  }
});
