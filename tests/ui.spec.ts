import { test, expect } from "@playwright/test";

// Desktop UI smoke tests. A fresh context has empty localStorage, so main.ts loads the
// default stack (Tone + Error Diffusion) → "STACK · 2".

test.beforeEach(async ({ page }) => {
  // Headless Chromium exposes the File System Access "Save As" picker, but Playwright can't dismiss
  // its native dialog, so an export would hang. Delete it to exercise the download fallback (the
  // path Firefox/Safari take); one test below re-adds a stub to cover the picker itself.
  await page.addInitScript(() => { try { delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker; } catch { /* ignore */ } });
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

test("reordering a filter by dragging its title bar sticks (and survives reload)", async ({ page }) => {
  const titles = page.locator(".sidebar .fcard-title");
  await expect(titles).toHaveCount(2);
  const before = await titles.allInnerTexts();

  const bar0 = (await page.locator(".sidebar .fcard-bar").nth(0).boundingBox())!;
  const card1 = (await page.locator(".sidebar .fcard").nth(1).boundingBox())!;
  await page.mouse.move(bar0.x + bar0.width / 2, bar0.y + bar0.height / 2);
  await page.mouse.down();
  await page.mouse.move(card1.x + card1.width / 2, card1.y + card1.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(titles.first()).not.toHaveText(before[0]); // order changed in-session
  await page.reload();
  await expect(titles.first()).not.toHaveText(before[0]); // and persisted
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

test("share filters writes a #s= hash to the URL", async ({ page }) => {
  await page.getByRole("button", { name: /SHARE FILTERS/ }).click();
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

test("export PNG uses the native Save-As destination picker when available", async ({ page }) => {
  // Re-add a stubbed File System Access picker (the beforeEach deleted it) and verify export routes
  // through it — this is what gives a real desktop Chrome/Edge a "choose where to save" dialog.
  await page.addInitScript(() => {
    (window as unknown as { __picked?: boolean }).__picked = false;
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = async () => {
      (window as unknown as { __picked?: boolean }).__picked = true;
      return { createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
    };
  });
  await page.reload();
  await loadImage(page);
  await page.getByRole("button", { name: /EXPORT/ }).click();
  await page.locator(".modal select").first().selectOption("png");
  await page.getByRole("button", { name: "EXPORT", exact: true }).click();
  await expect(page.locator(".modal-title", { hasText: "SAVED" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __picked?: boolean }).__picked)).toBe(true);
});

test("adjusting a slider keeps the canvas at full resolution", async ({ page }) => {
  await loadImage(page);
  const widthOf = () => page.locator("canvas.output").evaluate((c) => (c as HTMLCanvasElement).width);
  const full = await widthOf();
  const slider = page.locator(".sidebar input[type=range]").first();
  for (let i = 0; i < 6; i++) {
    await slider.evaluate((el: HTMLInputElement, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, 0.3 + i * 0.05);
  }
  await page.waitForTimeout(150);
  expect(await widthOf()).toBe(full); // resolution stays constant (no shrinking preview)
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

test("the ? shortcut opens the keyboard help, Esc closes it", async ({ page }) => {
  await page.keyboard.press("?");
  await expect(page.locator(".help-overlay .modal-title")).toHaveText("KEYBOARD & GESTURES");
  await expect(page.locator(".help-row").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".help-overlay")).toHaveCount(0);
  // also via the toolbar button
  await page.getByRole("button", { name: "?", exact: true }).click();
  await expect(page.locator(".help-overlay")).toBeVisible();
});

test("hovering a filter shows a rendered preview thumbnail", async ({ page }) => {
  await loadImage(page);
  await page.locator(".panel-left .filter-chip").first().hover();
  await expect(page.locator(".chip-preview.show")).toBeVisible();
  await expect(page.locator(".chip-preview canvas")).toBeVisible();
});
