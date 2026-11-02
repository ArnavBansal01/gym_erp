/**
 * screenshot.ts — takes "before" screenshots of all routes
 * Run: npx ts-node --project tsconfig.json docs/screenshot.ts
 * OR:  node -e "require('...')"
 * 
 * Uses Playwright's chromium directly (not test runner).
 */
const { chromium } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const BASE_URL = "http://localhost:3001";
const OUT_DIR = path.join(__dirname, "before");
fs.mkdirSync(OUT_DIR, { recursive: true });

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/admin", name: "admin-login" },
  { path: "/attendance", name: "attendance" },
  { path: "/dashboard", name: "dashboard" },
  { path: "/pending-approval", name: "pending-approval" },
  { path: "/trainer/login", name: "trainer-login" },
  { path: "/trainer/dashboard", name: "trainer-dashboard" },
  { path: "/trainer/attendance", name: "trainer-attendance" },
];

const VIEWPORTS = [
  { width: 390, height: 844, label: "mobile" },
  { width: 1440, height: 900, label: "desktop" },
];

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();

    // Mock Firebase and API calls at network level
    await page.route(/firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.route("**/api/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, users: [], logs: [], expenses: [], trainers: [], exists: false }) });
    });

    for (const route of ROUTES) {
      try {
        await page.goto(`${BASE_URL}${route.path}`, { timeout: 15000, waitUntil: "networkidle" });
        await page.waitForTimeout(1000);
        const fname = `${route.name}-${vp.label}.png`;
        await page.screenshot({ path: path.join(OUT_DIR, fname), fullPage: true });
        console.log(`✓ ${fname}`);
      } catch (e) {
        console.error(`✗ ${route.path} (${vp.label}):`, e.message);
      }
    }

    await context.close();
  }

  await browser.close();
  console.log("\nDone! Screenshots saved to docs/before/");
})();

