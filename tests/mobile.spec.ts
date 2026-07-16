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

// Android/iOS coverage for the lychee hotfix: on a touch device, an oversized camera photo must
// still export with its effects (capped, non-blank) — the delivery falls back to a download here
// since headless Chromium has no navigator.share, proving the mobile path doesn't break.
test("mobile: oversized photo exports capped and with effects", async ({ page }) => {
  await page.goto("/");
  const dataUrl = await page.evaluate(() => {
    const w = 6000, h = 4000;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#000"); grad.addColorStop(1, "#fff");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    return c.toDataURL("image/png");
  });
  const buffer = Buffer.from(dataUrl.split(",")[1], "base64");
  await page.locator('input[accept="image/*"]').first().setInputFiles({ name: "camera.png", mimeType: "image/png", buffer });
  await expect.poll(() => page.locator("canvas.output").evaluate((c) => (c as HTMLCanvasElement).width)).not.toBe(640);

  await page.locator(".panel-left .palette.two button", { hasText: "FLOYD" }).first().click();
  await page.waitForTimeout(1200);

  await page.keyboard.press("e"); // opens the export dialog regardless of the mobile layout
  await expect(page.locator(".modal")).toBeVisible();
  await page.locator(".modal-row", { hasText: "Scale" }).locator("select").selectOption({ label: "Native" });

  // On touch, export does NOT rely on a (flaky) download — it shows a long-press save window with
  // the rendered image, so we inspect that image directly.
  await page.locator(".modal .btn.primary", { hasText: "EXPORT" }).click();
  await expect(page.locator(".save-modal")).toBeVisible();
  const src = await page.locator(".save-img").getAttribute("src");
  expect(src ?? "").toMatch(/^(blob:|data:image\/)/);

  const stats = await page.evaluate(async (u) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = u; });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const levels = new Set<number>(); let nonWhite = 0;
    for (let i = 0; i < d.length; i += 4) { levels.add(d[i]); if (d[i] < 250) nonWhite++; }
    return { w: c.width, h: c.height, levels: levels.size, nonWhite };
  }, src);

  expect(Math.max(stats.w, stats.h)).toBeLessThanOrEqual(4096); // capped
  expect(stats.nonWhite).toBeGreaterThan(1000);                 // not blank
  expect(stats.levels).toBeLessThan(8);                          // dithered
});

// Dispatch a one-finger touch drag (start → move → end) at page coordinates.
async function touchDrag(page: import("@playwright/test").Page, selector: string, sx: number, sy: number, tx: number, ty: number) {
  await page.evaluate(({ selector, sx, sy, tx, ty }) => {
    const el = document.querySelector(selector) as HTMLElement;
    const fire = (type: string, x: number, y: number, ended = false) => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent(type, { touches: ended ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
    };
    fire("touchstart", sx, sy);
    fire("touchmove", tx, ty);
    fire("touchend", tx, ty, true);
  }, { selector, sx, sy, tx, ty });
}

test("touch: one-finger pan moves the canvas", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[accept="image/*"]').first().setInputFiles("src/io/demo.jpg");
  await expect
    .poll(() => page.locator("canvas.output").evaluate((c) => (c as HTMLCanvasElement).width))
    .not.toBe(640);

  const transform = () => page.locator("canvas.output").evaluate((c) => (c as HTMLElement).style.transform);
  const before = await transform();
  const box = (await page.locator(".canvas-wrap").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await touchDrag(page, ".canvas-wrap", cx, cy, cx + 40, cy + 30);

  expect(await transform()).not.toBe(before);
});

// Dispatch a touch-type pointer drag (start → move → end) at page coordinates.
async function pointerDrag(page: import("@playwright/test").Page, selector: string, sx: number, sy: number, tx: number, ty: number) {
  await page.evaluate(({ selector, sx, sy, tx, ty }) => {
    const el = document.querySelector(selector) as HTMLElement;
    const fire = (type: string, x: number, y: number) =>
      el.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    fire("pointerdown", sx, sy);
    fire("pointermove", tx, ty);
    fire("pointerup", tx, ty);
  }, { selector, sx, sy, tx, ty });
}

test("touch: drag a filter card to reorder the stack", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /STACK/ }).click();

  const titles = page.locator(".sidebar .fcard-title");
  await expect(titles).toHaveCount(2);
  const firstBefore = await titles.first().innerText();

  const bar = (await page.locator(".sidebar .fcard-bar").first().boundingBox())!;
  const second = (await page.locator(".sidebar .fcard").nth(1).boundingBox())!;
  await pointerDrag(
    page, ".sidebar .fcard-bar",
    bar.x + bar.width / 2, bar.y + bar.height / 2,
    second.x + second.width / 2, second.y + second.height / 2,
  );

  await expect(titles.first()).not.toHaveText(firstBefore); // the order changed
});
