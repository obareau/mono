import { test, expect } from "@playwright/test";

// Mobile layout: the canvas stays pinned on top and a Filters/Stack tab bar toggles which
// panel is shown. Runs under the Pixel 5 project (393px wide → mobile CSS active).

test("canvas pinned and the tab bar toggles between Filters and Stack", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".stage")).toBeVisible();
  await expect(page.locator(".mobile-tabs")).toBeVisible();

  // default tab = Filters: browser visible, stack hidden
  await expect(page.locator(".panel-left")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();

  // switch to Stack
  await page.getByRole("button", { name: /STACK/ }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".panel-left")).toBeHidden();

  // back to Filters
  await page.getByRole("button", { name: "FILTERS", exact: true }).click();
  await expect(page.locator(".panel-left")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
});
