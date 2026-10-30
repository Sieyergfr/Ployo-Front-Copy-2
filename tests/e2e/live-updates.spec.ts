import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_TENANT_SLUG, E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./fixture";

const prisma = new PrismaClient();
test.afterAll(async () => { await prisma.$disconnect(); });

test("receives changes from another client and reconnects without reloading", async ({ page, context, baseURL }) => {
  const login = await context.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL! }, data: { email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD },
  });
  expect(login.ok()).toBe(true);
  const initial = page.waitForResponse((r) => r.url().includes(`/api/tenants/${E2E_TENANT_SLUG}/live`) && r.status() === 200);
  await page.goto(`/u/${E2E_TENANT_SLUG}/employees`);
  await page.getByRole("dialog", { name: "Cookie-Einstellungen" }).getByRole("button", { name: "Nur notwendige" }).click();
  await initial;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  const employee = await prisma.tenantEmployee.create({ data: {
    tenantId: tenant.id, key: "live-test-person", name: "Live Person Eins", initials: "LP", employeeNumber: "LIVE-E2E",
  } });
  await expect(page.getByText("Live Person Eins", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await prisma.tenantEmployee.update({ where: { id: employee.id }, data: { name: "Live Person Zwei" } });
  await expect(page.getByText("Live Person Zwei", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  // Simulate an interrupted HTTP connection. The client must recover on its own.
  let interrupted = false;
  await page.route(`**/api/tenants/${E2E_TENANT_SLUG}/live*`, async (route) => {
    if (!interrupted) { interrupted = true; await route.abort("connectionreset"); }
    else await route.continue();
  });
  await prisma.tenantEmployee.update({ where: { id: employee.id }, data: { name: "Live Reconnect Person" } });
  await expect(page.getByText("Live Reconnect Person", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => interrupted, { timeout: 15_000 }).toBe(true);
  await prisma.tenantEmployee.delete({ where: { id: employee.id } });
  await expect(page.getByText("Live Reconnect Person", { exact: true })).toHaveCount(0, { timeout: 15_000 });
});

test("preserves unsaved info-request inputs during a live refresh", async ({ page, context, baseURL }) => {
  const login = await context.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL! }, data: { email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD },
  });
  expect(login.ok()).toBe(true);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  const employee = await prisma.tenantEmployee.create({ data: {
    tenantId: tenant.id, key: "live-editor-person", name: "Live Editor Person", initials: "LE", employeeNumber: "LIVE-EDITOR",
  } });
  const initial = page.waitForResponse((r) => r.url().includes(`/api/tenants/${E2E_TENANT_SLUG}/live`) && r.status() === 200);
  await page.goto(`/u/${E2E_TENANT_SLUG}/employees/live-editor-person?tab=requests`);
  await page.getByRole("dialog", { name: "Cookie-Einstellungen" }).getByRole("button", { name: "Nur notwendige" }).click();
  await initial;
  await page.getByRole("button", { name: "Info anfragen", exact: true }).first().click();
  const editor = page.getByRole("dialog", { name: "Info anfragen", exact: true });
  await editor.getByLabel("Benötigte Information").fill("Noch nicht gespeicherter Text");
  await editor.getByLabel("Nachricht", { exact: true }).fill("Lokale Eingaben behalten");
  const changed = page.waitForResponse((r) => r.url().includes(`/api/tenants/${E2E_TENANT_SLUG}/live`) && r.status() === 200);
  await prisma.tenantEmployee.update({ where: { id: employee.id }, data: { name: "Live Editor Aktualisiert" } });
  await changed;
  await expect(page.getByText("Live Editor Aktualisiert", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Benötigte Information")).toHaveValue("Noch nicht gespeicherter Text");
  await expect(editor.getByLabel("Nachricht", { exact: true })).toHaveValue("Lokale Eingaben behalten");
});
