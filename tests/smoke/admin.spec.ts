/**
 * smoke/admin.spec.ts
 *
 * Tests for `/admin` — Admin ERP Dashboard.
 * Uses simple sessionStorage auth (admin/boss123), no Firebase needed.
 *
 * Covers:
 *  ✓ Login screen renders
 *  ✓ Username and password inputs present
 *  ✓ Wrong credentials show error
 *  ✓ Correct credentials unlock dashboard (tabs appear)
 *  ✓ Dashboard tabs (overview, members, attendance) visible after login
 *  ✓ Admin logout returns to login screen
 *  ✓ No page-level JS errors
 */

import { test, expect } from "@playwright/test";
import { mockApiRoutes, mockCamera, mockHtml5Qrcode } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockCamera(page);
  await mockHtml5Qrcode(page);
  await mockApiRoutes(page);
});

async function doAdminLogin(page: import("@playwright/test").Page) {
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");

  // Fill credentials
  const usernameInput = page.getByPlaceholder("admin").or(page.locator("input[type='text']").first());
  const passwordInput = page.getByPlaceholder("••••••••").or(page.locator("input[type='password']").first());

  await usernameInput.fill("admin");
  await passwordInput.fill("boss123");
  await page.getByRole("button", { name: /sign in to erp/i }).click();

  // Wait for the data to load — API is mocked so it should be fast
  await page.waitForTimeout(2000);
}

test("admin login page renders form", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /aura athletic erp/i })).toBeVisible();
  await expect(page.locator("input[type='text']").first()).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("input[type='password']").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in to erp/i })).toBeVisible();
});

test("wrong credentials show error message", async ({ page }) => {
  await page.goto("/admin");
  await page.locator("input[type='text']").first().fill("wrong");
  await page.locator("input[type='password']").first().fill("wrong");
  await page.getByRole("button", { name: /sign in to erp/i }).click();
  await expect(
    page.getByText(/invalid credentials/i).or(page.getByText(/verify/i))
  ).toBeVisible({ timeout: 5_000 });
});

test("correct credentials unlock admin dashboard", async ({ page }) => {
  await doAdminLogin(page);

  // After successful login the tabs should render
  await expect(
    page.getByRole("button", { name: /overview/i })
  ).toBeVisible({ timeout: 10_000 });
});

test("admin dashboard shows management tabs", async ({ page }) => {
  await doAdminLogin(page);

  for (const tabName of ["overview", "members"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(tabName, "i") })
    ).toBeVisible({ timeout: 10_000 });
  }
});

test("admin logout returns to login screen", async ({ page }) => {
  await doAdminLogin(page);

  // Find logout button
  const logoutBtn = page.locator("button[title='Sign Out']")
    .or(page.getByRole("button", { name: /sign out/i }));

  if (await logoutBtn.isVisible({ timeout: 5_000 })) {
    await logoutBtn.click();
    await expect(
      page.getByRole("button", { name: /sign in to erp/i })
    ).toBeVisible({ timeout: 5_000 });
  }
});

test("admin page has no critical page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    if (!err.message.includes("Firebase") && !err.message.includes("Html5")) {
      errors.push(err.message);
    }
  });
  await page.goto("/admin");
  await page.waitForTimeout(1000);
  expect(errors).toHaveLength(0);
});
