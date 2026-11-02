/**
 * smoke/trainer.spec.ts
 *
 * Tests for trainer routes.
 *
 * NOTE ON FIREBASE AUTH:
 * The trainer/login page redirects an already-authenticated trainer to dashboard.
 * In our tests, we do NOT inject Firebase auth for the login page test — so it
 * stays on the login page and we can assert its UI.
 *
 * For trainer/dashboard and trainer/attendance, the pages redirect to
 * /trainer/login when no auth is detected. We test that the redirect lands
 * gracefully (no crash).
 *
 * Covers:
 *  ✓ Trainer login page loads (no auth injected)
 *  ✓ Trainer login page has Google sign-in button and tabs
 *  ✓ Trainer login "Apply as Staff" tab shows form
 *  ✓ Trainer dashboard loads without JS crash (may redirect to login)
 *  ✓ Trainer attendance loads without JS crash (may redirect)
 */

import { test, expect } from "@playwright/test";
import { mockApiRoutes, mockCamera, mockHtml5Qrcode } from "./helpers";

// No Firebase auth injection for trainer tests — login page must show its own UI
test.beforeEach(async ({ page }) => {
  await mockCamera(page);
  await mockHtml5Qrcode(page);
  await mockApiRoutes(page);
});

test("trainer login page loads with sign-in button", async ({ page }) => {
  await page.goto("/trainer/login");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Should show "Coach Terminal" heading and Google sign-in button
  await expect(
    page.getByRole("heading", { name: /coach terminal/i })
      .or(page.getByText(/coach terminal/i))
  ).toBeVisible({ timeout: 10_000 });

  // Assert Google sign-in button
  await expect(
    page.getByRole("button", { name: /continue with google/i })
  ).toBeVisible({ timeout: 10_000 });
});

test("trainer login has two tabs: sign-in and apply", async ({ page }) => {
  await page.goto("/trainer/login");
  await page.waitForTimeout(1000);

  await expect(page.getByRole("button", { name: /coach sign in/i })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("button", { name: /apply as staff/i })).toBeVisible({ timeout: 5_000 });
});

test("trainer login 'Apply as Staff' tab shows application form", async ({ page }) => {
  await page.goto("/trainer/login");
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: /apply as staff/i }).click();

  await expect(page.getByRole("button", { name: /submit coach application/i })).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("select")).toBeVisible();
});

test("trainer dashboard loads without JS crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    if (!err.message.includes("Firebase") && !err.message.includes("Html5")) {
      errors.push(err.message);
    }
  });

  await page.goto("/trainer/dashboard");
  await page.waitForTimeout(3000);

  expect(errors).toHaveLength(0);

  // Should either show dashboard or redirect to login — both are valid
  const url = page.url();
  expect(url).toMatch(/\/(trainer\/dashboard|trainer\/login)$/);
});

test("trainer attendance loads without JS crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    if (!err.message.includes("Firebase") && !err.message.includes("Html5")) {
      errors.push(err.message);
    }
  });

  await page.goto("/trainer/attendance");
  await page.waitForTimeout(3000);

  expect(errors).toHaveLength(0);
});
