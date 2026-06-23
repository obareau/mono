import { test, expect, type Page } from "@playwright/test";

// Visual regression without screenshots: hash the canvas's raw pixel data for a few
// deterministic preset stacks. Canvas 2D pixels are pure-JS (no GPU/AA/resampling), so the
// hash is identical across machines — unlike an element screenshot, which the browser
// composites at display size and varies between local and CI. If a filter's output changes,
// the hash changes and the test fails. Regenerate the values below intentionally.
const EXPECTED: Record<string, string> = {
  FLOYD: "b7f4b28b:1024x559",
  BAYER: "249638bb:1024x559",
  HALFTONE: "5d80460f:1024x559",
  CROSSHATCH: "d810b99e:1024x559",
};

async function loadDemo(page: Page) {
  await page.goto("/");
  await page.locator('input[accept="image/*"]').first().setInputFiles("src/io/demo.jpg");
  await expect.poll(() => page.locator("canvas.output").evaluate((c) => (c as HTMLCanvasElement).width)).not.toBe(640);
}

// FNV-1a over the red channel (gray: r=g=b) of the intrinsic canvas, plus its dimensions.
function canvasHash(page: Page) {
  return page.locator("canvas.output").evaluate((c) => {
    const el = c as HTMLCanvasElement;
    const d = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < d.length; i += 4) { h ^= d[i]; h = Math.imul(h, 0x01000193); }
    return `${(h >>> 0).toString(16)}:${el.width}x${el.height}`;
  });
}

for (const preset of Object.keys(EXPECTED)) {
  test(`render: ${preset.toLowerCase()}`, async ({ page }) => {
    await loadDemo(page);
    await page.locator(".panel-left .palette.two button", { hasText: preset }).first().click();
    // poll until the (async worker) render settles to the expected pixels
    await expect.poll(() => canvasHash(page), { timeout: 8000 }).toBe(EXPECTED[preset]);
  });
}
