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

test("touch: drag a filter card to reorder the stack", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /STACK/ }).click();

  const titles = page.locator(".sidebar .fcard-title");
  await expect(titles).toHaveCount(2);
  const firstBefore = await titles.first().innerText();

  const bar = (await page.locator(".sidebar .fcard-bar").first().boundingBox())!;
  const second = (await page.locator(".sidebar .fcard").nth(1).boundingBox())!;
  await touchDrag(
    page, ".sidebar .fcard-bar",
    bar.x + bar.width / 2, bar.y + bar.height / 2,
    second.x + second.width / 2, second.y + second.height / 2,
  );

  await expect(titles.first()).not.toHaveText(firstBefore); // the order changed
});
