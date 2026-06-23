import { test, expect } from "@playwright/test";

// Desktop UI smoke tests. A fresh context has empty localStorage, so main.ts loads the
// default stack (Tone + Error Diffusion) → "STACK · 2".

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("core panels and toolbar render", async ({ page }) => {
  await expect(page.locator(".topbar .logo")).toContainText("MONO");
  await expect(page.getByRole("button", { name: "OPEN IMAGE" })).toBeVisible();
  await expect(page.getByRole("button", { name: /EXPORT/ })).toBeVisible();
  await expect(page.locator(".panel-left")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".mobile-tabs")).toBeHidden(); // desktop hides the tab bar
});

test("default stack has two filters", async ({ page }) => {
  await expect(page.locator(".sidebar .phead span").first()).toContainText("STACK · 2");
});

test("adding a filter grows the stack; undo and redo revert and reapply", async ({ page }) => {
  const count = page.locator(".sidebar .phead span").first();
  await expect(count).toContainText("STACK · 2");

  await page.locator(".panel-left .filter-chip .chip-label").first().click();
  await expect(count).toContainText("STACK · 3");

  await page.getByRole("button", { name: "UNDO", exact: true }).click();
  await expect(count).toContainText("STACK · 2");

  await page.getByRole("button", { name: "REDO", exact: true }).click();
  await expect(count).toContainText("STACK · 3");
});

test("export dialog opens, exposes a format select, and closes", async ({ page }) => {
  await page.getByRole("button", { name: /EXPORT/ }).click();
  await expect(page.locator(".modal-title")).toHaveText("EXPORT");
  await expect(page.locator(".modal select").first()).toBeVisible();
  await page.getByRole("button", { name: "CANCEL" }).click();
  await expect(page.locator(".modal")).toHaveCount(0);
});

test("filter search hides non-matching filters", async ({ page }) => {
  await page.locator(".panel-left .search").fill("halftone");
  await expect(page.locator(".panel-left .filter-chip", { hasText: "Halftone" }).first()).toBeVisible();
  await expect(page.locator(".panel-left .filter-chip", { hasText: "ASCII" })).toBeHidden();
});

test("favouriting a filter pins it to a Favourites group", async ({ page }) => {
  await expect(page.getByText("★ FAVOURITES")).toHaveCount(0);
  await page.locator(".panel-left .filter-chip .star").first().click();
  await expect(page.getByText("★ FAVOURITES")).toBeVisible();
});
