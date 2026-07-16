// How a finished file leaves the app. On mobile — iOS Safari especially — the classic
// `<a download>` trick is ignored for blob: URLs (the file opens in-tab or nothing happens),
// so "impossible de l'exporter" was the norm on phones. The Web Share API is the reliable
// path there: it hands the file to the OS share sheet (Save to Photos / Files / send). On
// desktop we keep the direct download, which is the expected behaviour. Part of the
// "lychee hotfix".

// Coarse pointer + no hover ≈ a touch device. On these, a script-triggered <a download> and even
// navigator.share are unreliable (Brave silently drops both once the tap's user-activation token
// has expired — which it has, after a multi-second pipeline render + async encode). So mobile uses
// a long-press "Save image" result window instead, with a Share button that carries a fresh tap.
export function isTouchDevice(): boolean {
  return typeof matchMedia === "function" && matchMedia("(hover: none) and (pointer: coarse)").matches;
}

// True if the platform can share this File (surface exists AND accepts files). Existence of the
// API doesn't guarantee it works (Brave), but a Share button tap is a fresh gesture, so it's worth
// offering when this is truthy.
export function canShareFile(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  return typeof nav.share === "function" && !!nav.canShare?.({ files: [file] });
}

// In-app WebViews (Facebook/Messenger, Instagram, etc.) are restricted browsers: `<a download>`
// for blob: URLs silently does nothing, navigator.share is often absent or a no-op, and
// window.open is blocked. When we're inside one, exporting via those APIs dead-ends — the caller
// should instead show the image for a long-press save (see the save overlay). Detected by UA.
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /\b(FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Line\/|Twitter|TwitterAndroid|Snapchat|TikTok|Pinterest|GSA)\b/i.test(ua)
    || /; wv\)/.test(ua); // generic Android WebView marker
}

// An Android intent: URL that reopens this page in Chrome — the escape hatch to a real browser
// where full-quality export/share works. Falls back to the default browser if Chrome is absent.
export function chromeIntentUrl(url = typeof location !== "undefined" ? location.href : ""): string {
  try {
    const u = new URL(url);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;`
      + `action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(u.toString())};end`;
  } catch {
    return url;
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000); // give slow mobile downloads time to start
}

export type DeliverOutcome = "shared" | "downloaded" | "cancelled" | "failed";

// Deliver a finished file. Prefers the native share sheet on touch devices (with a File the OS
// can save), and falls back to a download. Reports what happened so the caller can show a status.
// Must be called from a user gesture.
export async function deliverBlob(blob: Blob, filename: string): Promise<DeliverOutcome> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (isTouchDevice() && typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return "shared";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "cancelled"; // user dismissed sheet
      // any other failure: fall through to a plain download
    }
  }
  try {
    triggerDownload(blob, filename);
    return "downloaded";
  } catch {
    return "failed";
  }
}

// Copy a raster result to the clipboard as a real PNG (not a link), so a paste anywhere yields
// the edited photo. Returns false if the platform can't do it. Must run in a user gesture.
export async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  try {
    const Item = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (!Item || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new Item({ [blob.type || "image/png"]: blob })]);
    return true;
  } catch {
    return false;
  }
}

// Promisified canvas → PNG blob, guarding the blank/oversized-canvas case.
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob && blob.size > 0) resolve(blob);
      else reject(new Error("canvas produced an empty image (too large for this device?)"));
    }, "image/png");
  });
}
