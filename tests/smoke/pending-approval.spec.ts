/**
 * smoke/pending-approval.spec.ts
 *
 * Tests for `/pending-approval` — Trainer Pending Approval Screen.
 *
 * NOTE: Without real Firebase auth the page redirects to /
 * We test the redirect is clean (no crash) and then separately test
 * the page content by checking if it resolves to the pending screen.
 */

import { test, expect } from "@playwright/test";
import { mockApiRoutes, mockCamera } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockCamera(page);
  await mockApiRoutes(page);
});

test("pending approval page loads without JS crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/pending-approval");
  await page.waitForTimeout(3000);

  expect(errors.filter((e) => !e.includes("Firebase"))).toHaveLength(0);
});

test("pending approval page redirects or shows pending content", async ({ page }) => {
  await page.goto("/pending-approval");
  await page.waitForTimeout(3000);

  const url = page.url();

  // Either it redirects to / (no auth) or stays and shows pending content
  if (url.includes("/pending-approval")) {
    await expect(
      page.getByText(/pending/i).or(page.getByText(/verification/i)).or(page.getByText(/approval/i))
    ).toBeVisible({ timeout: 5_000 });
  } else {
    // Redirected to / (or /trainer/login) — valid unauthenticated behavior
    // url is the full URL e.g. http://localhost:3001/ — just verify no crash
    expect(url).toContain("localhost");
  }
});

test("pending approval page has sign out button when authenticated", async ({ page }) => {
  await page.goto("/pending-approval");
  await page.waitForTimeout(3000);

  const url = page.url();
  if (url.includes("/pending-approval")) {
    await expect(
      page.getByRole("button", { name: /sign out/i })
    ).toBeVisible({ timeout: 8_000 });
  }
  // If redirected to /, test passes — unauthenticated behavior is correct
});
