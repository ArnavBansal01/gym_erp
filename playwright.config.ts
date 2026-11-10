import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for AURA Athletic Club ERP smoke tests.
 * Tests run against a locally-started Next.js server.
 * Firebase and API calls are mocked at the network layer using route intercepts.
 */
export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  retries: 1,
  workers: 1, // serial to avoid port conflicts
  reporter: [["list"], ["html", { open: "never", outputFolder: "docs/playwright-report" }]],

  use: {
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Treat browser console errors as test failures only when explicitly asserted
  },

  webServer: {
    command: "npx next dev --port 3001 --webpack",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["iPhone 14"], viewport: { width: 390, height: 844 } },
    },
  ],
});

