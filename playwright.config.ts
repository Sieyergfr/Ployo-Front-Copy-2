import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  // "next dev" kompiliert jede Route erst beim ersten Aufruf — auf einem
  // frisch gestarteten (insb. CI-)Server kann das pro Route mehrere
  // Sekunden dauern. Das Standard-Test-Timeout (30s) reicht dafür über
  // mehrere Steps hinweg nicht.
  timeout: 90_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // "next dev" statt build+start: NODE_ENV=development trägt
    // http://localhost:3000 automatisch in trustedOrigins ein (siehe
    // lib/auth.ts, developmentOrigins) — ohne das lehnt better-auth den
    // Login mit INVALID_ORIGIN ab.
    command: "npm run dev",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
