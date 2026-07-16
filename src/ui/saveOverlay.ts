import { el } from "./controls";

// A single "export result" window shown after every save attempt, so the user always knows the
// outcome (saved / shared / failed / needs-a-manual-save) and is offered a fallback when a format
// can't be delivered on their device. When an image source is supplied it's shown for a long-press
// "Save image" — the only path that works across every Android browser (Brave, Samsung Internet,
// Firefox) AND the restricted in-app WebViews of Messenger/Instagram, where scripted downloads and
// the Share API silently fail. Part of the "lychee hotfix".

const OVERLAY_MAX = 1440; // long edge for the in-app long-press image — small enough to embed

// A compact data: URL for WebViews (whose "Save image" can't resolve blob: URLs, and which choke
// on very large data URLs). 1-bit output compresses tiny as PNG; large recoloured/soft images fall
// back to JPEG to stay under the ~1–2 MB data-URL ceiling.
export function downscaledDataURL(canvas: HTMLCanvasElement): string {
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

export interface ResultAction {
  label: string;
  href?: string;          // renders an <a> (e.g. the intent:// escape hatch)
  onClick?: () => void;   // renders a <button>
  primary?: boolean;
  keepOpen?: boolean;     // don't close the window on click (Share: leave the long-press fallback up)
}

export interface ExportResultOpts {
  title: string;                 // e.g. "SAVED ✓", "SHARED ✓", "SAVE IMAGE", "EXPORT FAILED"
  message?: string;              // status detail
  imageSrc?: string;             // if present, shown for long-press save (blob: or data: URL)
  actions?: ResultAction[];      // fallback buttons (e.g. "SHARE", "SAVE AS PNG", "OPEN IN CHROME")
  onClose?: () => void;          // cleanup (e.g. revoke a blob: URL)
}

export function openExportResult(opts: ExportResultOpts): void {
  const overlay = el("div", "modal-overlay");
  const panel = el("div", opts.imageSrc ? "modal save-modal" : "modal");
  const title = el("div", "modal-title");
  title.textContent = opts.title;

  const body = el("div", "modal-body");
  if (opts.message) {
    const msg = el("div", "save-hint");
    msg.textContent = opts.message;
    body.appendChild(msg);
  }
  if (opts.imageSrc) {
    const img = document.createElement("img");
    img.className = "save-img";
    img.alt = "Your edited image — long-press to save";
    img.src = opts.imageSrc;
    const hint = el("div", "save-hint");
    hint.innerHTML = "Long-press the image → <b>Save image</b>.<br>Appuie longuement sur l’image → <b>Enregistrer l’image</b>.";
    body.append(img, hint);
  }

  const foot = el("div", "modal-foot");
  for (const a of opts.actions ?? []) {
    if (a.href) {
      const link = document.createElement("a");
      link.className = `btn${a.primary ? " primary" : ""}`;
      link.textContent = a.label;
      link.href = a.href;
      foot.appendChild(link);
    } else {
      const b = document.createElement("button");
      b.className = `btn${a.primary ? " primary" : ""}`;
      b.textContent = a.label;
      b.addEventListener("click", () => { if (!a.keepOpen) close(); a.onClick?.(); });
      foot.appendChild(b);
    }
  }
  const done = document.createElement("button");
  done.className = "btn primary";
  done.textContent = "DONE";
  done.addEventListener("click", close);
  foot.appendChild(done);

  panel.append(title, body, foot);
  overlay.appendChild(panel);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    opts.onClose?.();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); close(); }
  }
}
