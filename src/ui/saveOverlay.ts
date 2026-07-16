import { el } from "./controls";

// Universal image save, for browsers where downloads and the Share API don't work — chiefly the
// in-app WebViews of Facebook Messenger / Instagram (where a user opened the link). Those block
// `<a download>` and often navigator.share, but they DO support the native "Save image" you get
// by long-pressing an <img>. The one catch: that context menu can only save a `data:` URL, not a
// `blob:` one, and Android WebView silently fails to render very large data URLs — so we downscale
// the result and embed it as a compact data URL. Part of the "lychee hotfix".

const OVERLAY_MAX = 1440; // long edge for the long-press image — plenty on a phone, stays small

// Build a compact data: URL for the result. 1-bit output compresses tiny as PNG; if a recoloured
// or soft-screen image somehow gets large, fall back to JPEG to stay under the WebView data-URL
// ceiling (~1–2 MB) where rendering silently breaks.
function toSafeDataURL(canvas: HTMLCanvasElement): string {
  let src = canvas;
  const long = Math.max(canvas.width, canvas.height);
  if (long > OVERLAY_MAX) {
    const s = OVERLAY_MAX / long;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(canvas.width * s));
    c.height = Math.max(1, Math.round(canvas.height * s));
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    src = c;
  }
  let url = src.toDataURL("image/png");
  if (url.length > 1_400_000) url = src.toDataURL("image/jpeg", 0.9);
  return url;
}

// Show the rendered image in a modal with a "long-press to save" hint and, optionally, an
// "Open in Chrome" escape hatch for full-quality export in a real browser.
export function openSaveOverlay(canvas: HTMLCanvasElement, chromeUrl?: string): void {
  const overlay = el("div", "modal-overlay");
  const panel = el("div", "modal save-modal");
  const title = el("div", "modal-title");
  title.textContent = "SAVE IMAGE";

  const body = el("div", "modal-body");
  const img = document.createElement("img");
  img.className = "save-img";
  img.alt = "Your edited image — long-press to save";
  img.src = toSafeDataURL(canvas);
  const hint = el("div", "save-hint");
  hint.innerHTML = "Long-press the image → <b>Save image</b>.<br>Appuie longuement sur l’image → <b>Enregistrer l’image</b>.";
  body.append(img, hint);

  const foot = el("div", "modal-foot");
  if (chromeUrl) {
    const chrome = document.createElement("a");
    chrome.className = "btn";
    chrome.textContent = "OPEN IN CHROME";
    chrome.href = chromeUrl;
    chrome.title = "Reopen in Chrome for full-quality export";
    foot.appendChild(chrome);
  }
  const done = document.createElement("button");
  done.className = "btn primary";
  done.textContent = "DONE";
  foot.appendChild(done);
  panel.append(title, body, foot);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
  }
  done.addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
}
