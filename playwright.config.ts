import { defineConfig, devices } from "@playwright/test";

// E2E smoke tests for the MONO° UI. Boots the Vite dev server and runs a desktop suite
// plus a mobile suite (the mobile layout only kicks in below 860px).
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  // In CI, test the real production bundle (build + preview) so prod-only issues — e.g. the
  // module worker not loading from the built chunk — are caught. Locally, use the dev server.
  webServer: {
    command: process.env.CI
      ? "npm run build && npx vite preview --port 4173 --strictPort"
      : "npm run dev -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop",
      testMatch: /(ui|visual|export)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 5"] }, // 393×851 → triggers the mobile layout
    },
  ],
});
