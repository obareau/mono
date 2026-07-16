// Real-device smoke test: drives ACTUAL Chrome on a physical Android phone via Playwright's
// experimental _android API — not the desktop-Chromium mobile emulation the main E2E suite uses.
// This exercises the things that only differ on a real mobile browser: the touch-device detection,
// the per-device canvas limit probe (real GL_MAX_TEXTURE_SIZE), and the long-press save window that
// replaced the unreliable scripted download/share on touch.
//
// Run via `npm run test:android` (see scripts/android-test.sh): connect a phone (USB debugging or
// `adb connect`), and the script serves the build + `adb reverse`s it to the phone's localhost.
import { _android as android } from "playwright";

const URL = process.env.MONO_URL || "http://localhost:4173/";
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); console.log("  ✓ " + msg); };

const [device] = await android.devices();
if (!device) throw new Error("No Android device/emulator found (adb devices empty).");
console.log(`Device: ${device.model()} (serial ${device.serial()})`);

const context = await device.launchBrowser();
const page = (context.pages())[0] || (await context.newPage());
try {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  console.log(`Loaded ${URL} on real Android Chrome`);

  // 1) real touch device — this is what our isTouchDevice() relies on to pick the save path
  const coarse = await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches);
  ok(coarse, "reports as a touch device (hover:none, pointer:coarse)");

  // 2) inject a large synthetic photo straight into the file input (no native picker needed)
  await page.evaluate(async () => {
    const w = 5000, h = 3000; // ~15 MP, bigger than weak-GPU canvas limits
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#000"); g.addColorStop(1, "#fff");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const blob = await new Promise((res) => c.toBlob(res, "image/png"));
    const file = new File([blob], "camera.png", { type: "image/png" });
    const dt = new DataTransfer(); dt.items.add(file);
    const input = document.querySelector('input[accept="image/*"]');
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas.output");
    return c && c.width !== 640; // left the placeholder → the worker rendered the image
  }, { timeout: 30_000 });
  ok(true, "loaded a 15 MP image and the pipeline rendered a preview");

  // 3) apply a dithering filter
  await page.locator(".panel-left .palette.two button", { hasText: "FLOYD" }).first().click();
  await page.waitForTimeout(1500);

  // 4) export → on a real touch device this must show the long-press save window (not a broken
  //    download/share), with the rendered image capped to the device's real canvas limit
  await page.locator("button", { hasText: /EXPORT/ }).first().click();
  await page.locator(".modal .btn.primary", { hasText: "EXPORT" }).click();
  await page.locator(".save-modal").waitFor({ state: "visible", timeout: 15_000 });
  ok(true, "export shows the long-press save window on real Android Chrome");

  const stats = await page.evaluate(async () => {
    const img = document.querySelector(".save-img");
    const el = new Image();
    await new Promise((res, rej) => { el.onload = res; el.onerror = rej; el.src = img.src; });
    const c = document.createElement("canvas");
    c.width = el.naturalWidth; c.height = el.naturalHeight;
    const ctx = c.getContext("2d"); ctx.drawImage(el, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const levels = new Set(); let nonWhite = 0;
    for (let i = 0; i < d.length; i += 4) { levels.add(d[i]); if (d[i] < 250) nonWhite++; }
    return { w: c.width, h: c.height, levels: levels.size, nonWhite, src: img.src.slice(0, 12) };
  });
  console.log(`  save image: ${stats.w}×${stats.h}, ${stats.levels} levels, src=${stats.src}…`);
  ok(Math.max(stats.w, stats.h) <= 4096, "save image is capped to ≤ 4096 px (real device limit respected)");
  ok(stats.nonWhite > 1000, "save image is not blank");
  ok(stats.levels < 8, "save image contains the dithering effect");

  console.log("\nALL REAL-ANDROID CHECKS PASSED ✓");
} finally {
  await context.close();
}
