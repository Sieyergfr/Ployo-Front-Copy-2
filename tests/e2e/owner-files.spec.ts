import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_TENANT_SLUG, E2E_USER_EMAIL, E2E_USER_PASSWORD } from "./fixture";

test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
const cases = [
  { type: "employee", route: "employees", key: "e2e-file-person" },
  { type: "location", route: "standorte", key: "e2e-file-location" },
  { type: "team", route: "teams", key: "e2e-file-team" },
] as const;

test.beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  for (const item of cases) {
    const owner = item.type === "employee"
      ? await prisma.tenantEmployee.create({ data: { tenantId: tenant.id, key: item.key, name: "Datei Testperson", initials: "DT", employeeNumber: "E2E-FILE" } })
      : item.type === "location"
        ? await prisma.tenantLocation.create({ data: { tenantId: tenant.id, key: item.key, name: "Datei Teststandort", kind: "Filiale" } })
        : await prisma.tenantTeam.create({ data: { tenantId: tenant.id, key: item.key, name: "Datei Testteam" } });
    const relation = item.type === "employee" ? { employeeId: owner.id } : item.type === "location" ? { locationId: owner.id } : { teamId: owner.id };
    for (const path of ["source", "target"]) {
      await prisma.tenantFileFolder.create({ data: { tenantId: tenant.id, ...relation, scope: `${item.type}:${owner.id}`, path, slug: path, name: path === "source" ? "Ausgang" : "Ziel" } });
    }
    await prisma.tenantFile.create({ data: { tenantId: tenant.id, ...relation, storageKey: `e2e/${tenant.id}/${item.type}.pdf`, displayName: "Dateitest.pdf", originalName: "Dateitest.pdf", extension: "pdf", mimeType: "application/pdf", folderSlug: "", folderName: "Home" } });
  }
});
test.afterAll(async () => { await prisma.$disconnect(); });

for (const item of cases) {
  test(`${item.type}: folder and file actions work in the detail view`, async ({ page, context, baseURL }) => {
    const login = await context.request.post("/api/auth/sign-in/email", { headers: { Origin: baseURL! }, data: { email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD } });
    expect(login.ok()).toBe(true);
    await page.goto(`/u/${E2E_TENANT_SLUG}/${item.route}/${item.key}?tab=files`);
    await page.getByRole("dialog", { name: "Cookie-Einstellungen" }).getByRole("button", { name: "Nur notwendige" }).click();
    await page.getByRole("button", { name: "Aktionen für Ordner Ausgang", exact: true }).click();
    await page.getByRole("menu").getByRole("button", { name: "Umbenennen", exact: true }).click();
    const renameFolder = page.getByRole("dialog", { name: "Ordner umbenennen", exact: true });
    await renameFolder.getByLabel("Ordnername").fill("Unterlagen");
    await renameFolder.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(renameFolder).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Aktionen für Ordner Unterlagen", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Aktionen für Ordner Unterlagen", exact: true }).click();
    await page.getByRole("menu").getByRole("button", { name: "Anheften", exact: true }).click();
    await expect(page.locator('[data-pinned="true"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Aktionen für Ordner Unterlagen", exact: true }).click();
    await expect(page.getByRole("menu").getByRole("button", { name: "Lösen", exact: true })).toBeVisible();
    await page.getByRole("menu").getByRole("button", { name: "Sichtbarkeit & Rechte", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Sichtbarkeit & Rechte", exact: true });
    await expect(settings.getByText("Wer darf den Ordner sehen?", { exact: true })).toBeVisible();
    await settings.getByRole("button", { name: "Abbrechen", exact: true }).click();

    await page.getByRole("button", { name: "Aktionen für Dateitest.pdf", exact: true }).click();
    await page.getByRole("menu").getByRole("button", { name: "Umbenennen", exact: true }).click();
    const renameFile = page.getByRole("dialog", { name: "Datei umbenennen", exact: true });
    await renameFile.getByLabel("Dateiname").fill("Aktualisiert.pdf");
    await renameFile.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(renameFile).toHaveCount(0);
    await page.getByRole("button", { name: "Aktionen für Aktualisiert.pdf", exact: true }).click();
    await page.getByRole("menu").getByRole("button", { name: "Details & Versionen", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Details & Versionen", exact: true });
    await expect(details).toBeVisible();
    await expect(details.getByText("v1", { exact: false })).toBeVisible();
    await details.getByRole("button", { name: "Schließen", exact: true }).click();

    await page.getByRole("button", { name: "Aktionen für Aktualisiert.pdf", exact: true }).click();
    await page.getByRole("menu").getByRole("button", { name: "Verschieben …", exact: true }).click();
    const move = page.getByRole("dialog", { name: "Datei verschieben", exact: true });
    await move.getByLabel("Zielordner").selectOption("target");
    await move.getByRole("button", { name: "Verschieben", exact: true }).click();
    await expect(move).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Aktionen für Aktualisiert.pdf", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /^Ziel \d/ }).click();
    await expect(page.getByRole("button", { name: "Aktionen für Aktualisiert.pdf", exact: true })).toBeVisible();
  });
}
