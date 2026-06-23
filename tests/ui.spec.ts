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

test("randomize replaces the stack with a small random one", async ({ page }) => {
  await page.getByRole("button", { name: "RANDOM" }).click();
  await expect(page.locator(".sidebar .phead span").first()).toContainText(/STACK · [1-3]/);
});

test("clear empties the stack", async ({ page }) => {
  await page.getByRole("button", { name: "CLEAR" }).click();
  await expect(page.locator(".sidebar .phead span").first()).toContainText("STACK · 0");
  await expect(page.locator(".sidebar .empty")).toBeVisible();
});

test("copy link writes a #s= hash to the URL", async ({ page }) => {
  await page.getByRole("button", { name: /COPY LINK/ }).click();
  await expect(page).toHaveURL(/#s=/);
});

// ---- exports (load a real image first so the pipeline has a source) ----

async function loadImage(page: import("@playwright/test").Page) {
  await page.locator('input[accept="image/*"]').first().setInputFiles("src/io/demo.jpg");
  // wait until the canvas leaves its 640×400 placeholder, i.e. the image rendered
  await expect
    .poll(() => page.locator("canvas.output").evaluate((c) => (c as HTMLCanvasElement).width))
    .not.toBe(640);
}

test("export PNG downloads mono.png", async ({ page }) => {
  await loadImage(page);
  await page.getByRole("button", { name: /EXPORT/ }).click();
  await page.locator(".modal select").first().selectOption("png");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "EXPORT", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("mono.png");
});

test("export SVG downloads mono.svg when a vector filter is present", async ({ page }) => {
  await loadImage(page);
  await page.locator(".panel-left .filter-chip", { hasText: "Halftone" }).first().click();

  // the worker render flips on vector availability asynchronously; retry opening the
  // dialog until the SVG format option appears, then leave the dialog open
  await expect
    .poll(async () => {
      await page.getByRole("button", { name: /EXPORT/ }).click();
      const has = await page.locator('.modal select option[value="svg"]').count();
      if (!has) await page.getByRole("button", { name: "CANCEL" }).click();
      return has;
    }, { timeout: 5000 })
    .toBe(1);

  await page.locator(".modal select").first().selectOption("svg");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "EXPORT", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("mono.svg");
});
