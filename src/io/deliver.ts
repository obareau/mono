// How a finished file leaves the app. On mobile — iOS Safari especially — the classic
// `<a download>` trick is ignored for blob: URLs (the file opens in-tab or nothing happens),
// so "impossible de l'exporter" was the norm on phones. The Web Share API is the reliable
// path there: it hands the file to the OS share sheet (Save to Photos / Files / send). On
// desktop we keep the direct download, which is the expected behaviour. Part of the
// "lychee hotfix".

// Coarse pointer + no hover ≈ a touch device, where the share sheet is the right affordance.
function isTouchDevice(): boolean {
  return typeof matchMedia === "function" && matchMedia("(hover: none) and (pointer: coarse)").matches;
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

// Deliver a finished file. Prefers the native share sheet on touch devices (with a File the OS
// can save), and always falls back to a download. Must be called from a user gesture.
export async function deliverBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (isTouchDevice() && typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return; // shared (or the user cancelled the sheet) — do not also download
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return; // user dismissed the sheet
      // any other failure: fall through to a plain download
    }
  }
  triggerDownload(blob, filename);
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
