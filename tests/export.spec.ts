import { test, expect, type Page } from "@playwright/test";

// Regression for the "lychee hotfix": a camera-sized image (larger than the safe canvas limit)
// must still export WITH its effects. Before the fix, the native-scale export built a canvas
// bigger than mobile browsers allow, which came back blank — the saved PNG lost every effect.
// We can't reproduce the mobile blank-canvas here (desktop Chromium has huge limits), but we can
// lock in the guarantee that the source is capped so no downstream canvas exceeds MAX_SOURCE.
const MAX_SOURCE = 4096;

// Build a big PNG (6000×4000, ~24 MP — a typical phone photo) entirely in the browser and hand
// it to the file input as a buffer, so the test needs no fixture on disk.
async function makeBigImageBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const w = 6000, h = 4000;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    // a gradient + stripes so there's real tonal structure to dither
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#000"); grad.addColorStop(1, "#fff");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(128,128,128,0.5)";
    for (let x = 0; x < w; x += 200) ctx.fillRect(x, 0, 100, h);
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

test("oversized camera image still exports with effects", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto("/");
  const buffer = await makeBigImageBuffer(page);
  await page.locator('input[accept="image/*"]').first().setInputFiles({ name: "camera.png", mimeType: "image/png", buffer });
  await expect.poll(() => page.locator("canvas.output").evaluate((c) => (c as HTMLCanvasElement).width)).not.toBe(640);

  await page.locator(".panel-left .palette.two button", { hasText: "FLOYD" }).first().click();
  await page.waitForTimeout(1200);

  await page.keyboard.press("e");
  await expect(page.locator(".modal")).toBeVisible();
  // Native scale is the dangerous path — it used to build a full-resolution canvas.
  await page.locator(".modal-row", { hasText: "Scale" }).locator("select").selectOption({ label: "Native" });

  const dl = page.waitForEvent("download");
  await page.locator(".modal .btn.primary", { hasText: "EXPORT" }).click();
  const path = await (await dl).path();

  const { readFileSync } = await import("fs");
  const dataUrl = "data:image/png;base64," + readFileSync(path!).toString("base64");
  const histo = await page.evaluate(async (url) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const levels = new Set<number>();
    let nonWhite = 0;
    for (let i = 0; i < d.length; i += 4) { levels.add(d[i]); if (d[i] < 250) nonWhite++; }
    return { w: c.width, h: c.height, levels: levels.size, nonWhite };
  }, dataUrl);

  expect(errors, errors.join(" | ")).toEqual([]);
  // 1) source capped: the export canvas long edge never exceeds the safe limit
  expect(Math.max(histo.w, histo.h)).toBeLessThanOrEqual(MAX_SOURCE);
  // 2) not blank: a real dithered image, not an empty (all-white) canvas
  expect(histo.nonWhite, "exported image must not be blank").toBeGreaterThan(1000);
  // 3) dithered: Floyd on a gradient collapses to ~2 levels
  expect(histo.levels, "exported image must contain the effect").toBeLessThan(8);
});
