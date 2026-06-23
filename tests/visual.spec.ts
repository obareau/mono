import { test, expect } from "@playwright/test";

// Visual regression: render a few deterministic preset stacks and compare the canvas pixels
// to committed baselines, so a filter's output can't silently change. The canvas is pure-JS
// (deterministic), so these are stable across machines.

async function loadDemo(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.locator('input[accept="image/*"]').first().setInputFiles("src/io/demo.jpg");
  await expect
    .poll(() => page.locator("canvas.output").evaluate((c) => (c as HTMLCanvasElement).width))
    .not.toBe(640);
}

// preset names from the PRESETS palette — all fully deterministic filters
for (const preset of ["FLOYD", "BAYER", "HALFTONE", "CROSSHATCH"]) {
  test(`render: ${preset.toLowerCase()}`, async ({ page }) => {
    await loadDemo(page);
    await page.locator(".panel-left .palette.two button", { hasText: preset }).first().click();
    // toHaveScreenshot retries until the canvas is stable, so it waits out the worker render
    await expect(page.locator("canvas.output")).toHaveScreenshot(`${preset.toLowerCase()}.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
