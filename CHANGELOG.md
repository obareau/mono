# Mono — Changelog

## Lychee hotfix — 2026-07-16

**Mobile save no longer depends on a scripted download or auto-share** (fixes export working in
Samsung Internet but not Brave on the same tablet). Root cause: user-activation expiry — after the
Export tap, the multi-second pipeline render + async PNG encode outlive the gesture token, and Brave
(stricter than Samsung Internet) then silently drops both `<a download>.click()` and
`navigator.share`. Fix: on any touch device, export now shows the rendered image in a result window
for a **long-press "Save image"** (the one path reliable across Brave / Samsung Internet / Firefox /
in-app WebViews), plus a **Share** button when available — tapping Share is a *fresh* gesture, so it
works even in Brave. Real mobile browsers get a full-resolution `blob:` image; in-app WebViews get a
downscaled `data:` URL (their save menu can't resolve `blob:`). Desktop keeps the direct download.

**Every export now reports its outcome.** Instead of a silent download (and the guesswork of "did
it save?"), every Export / Copy action ends in a status window: **SAVED ✓** / **SHARED ✓** /
**COPIED ✓**, or a failure with a **fallback** — a vector/text format that can't be written on the
device offers **SAVE AS PNG** and **OPEN IN CHROME**, and a raster that the browser refused to
download falls back to the long-press save image. (`ui/saveOverlay.ts › openExportResult`,
`deliver.ts` now returns the delivery outcome.)


Fixes "impossible to save/export my edited photo" reported by users on both mobile and desktop
(the live preview looked correct, but the exported image came back blank / without effects, and
"copy" only produced a link to the app, not the photo). Three root causes, all addressed:

- **Oversized camera images → blank export.** Photos are commonly 12–48 MP (4032×3024 up to
  8000×6000). Native-scale export re-rendered the pipeline into a canvas that big, which exceeds
  the per-canvas limit mobile browsers enforce (iOS Safari caps total area at ~16.7 M px = 4096²,
  and older devices far lower) — over the limit, `drawImage`/`getImageData`/`toBlob` silently
  yield a **blank** canvas, so the saved PNG lost every effect while the ≤1024 px preview stayed
  fine. Fix: the original bitmap is now downscaled on load to fit **≤ 4096 long edge and
  ≤ 16.7 M px area** (`MAX_SOURCE` in `src/io/loadImage.ts`), and every export path is clamped to
  the same ceiling. This also avoids the 48 MP out-of-memory tab reload on iOS.
- **iOS ignored the download.** The `<a download>` trick is a no-op for `blob:` URLs on iOS
  Safari (the file opens in-tab or nothing happens). Fix: on touch devices, delivery now goes
  through the **Web Share API** (`navigator.share({ files })` → Save to Photos / Files); desktop
  keeps the direct download. Centralized in `src/io/deliver.ts`. Applies to PNG/SVG/PDF/TXT/HTML.
- **"Copy" gave a link, not the image.** COPY LINK only ever shared the *filter stack* in a URL
  hash (an image can't fit in a URL), so pasting it opened the app with no photo. Fix: added a
  **COPY IMG** button that puts the actual rendered PNG on the clipboard
  (`navigator.clipboard.write([ClipboardItem])`); the link button is relabeled/clarified.

**Cross-device hardening (Android + old iOS).** The cap is not a hard-coded number: `safeCanvas.ts`
**probes the real device limit** at runtime (draws a marker on a square canvas and reads it back;
an over-limit canvas silently blanks). Some low-end Android GPUs cap a canvas dimension below 4096
(`GL_MAX_TEXTURE_SIZE`), and old iOS caps area lower — the probe picks the largest size that
actually renders (4096 → 3072 → 2048 → …), so load and export both respect the device. Android's
save path is covered by the same `deliver.ts` logic (Web Share where available, `<a download>`
fallback — which, unlike iOS, works on Android).

**In-app browsers (Facebook Messenger / Instagram WebView).** A user who opens the link from a
Messenger message lands in a restricted Android WebView where `<a download>` silently does
nothing, `navigator.share` is often absent, and `window.open` is blocked — so every normal export
path dead-ends ("unable to export" on a Samsung tablet). Fix: detect the in-app WebView by UA
(`deliver.ts › isInAppBrowser`) and route Export / Copy Image to a **long-press save overlay**
(`ui/saveOverlay.ts`) — the rendered image is shown as a compact **`data:` URL** `<img>` (not
`blob:`, which the WebView "Save image" menu can't resolve; downscaled to ≤ 1440 px, PNG→JPEG
fallback to stay under the WebView data-URL ceiling), with a "long-press → Save image" hint and an
**`intent://…package=com.android.chrome`** escape hatch to reopen full-quality in Chrome. Vector
formats (SVG/PDF) toast "Open in Chrome to export" in that context.

Regression tests: `tests/export.spec.ts` (desktop + a UA-spoofed Messenger-WebView case) and a
mobile/touch case in `tests/mobile.spec.ts` (Pixel 5) load a 24 MP synthetic image and assert the
export is capped to ≤ 4096 px, non-blank, and still dithered — and, in the WebView, that a
data-URL save overlay appears instead of a broken download.

## [0.1.0] — 2026-07-08

- Initialisation du changelog par Argus (aucun historique antérieur documenté).
