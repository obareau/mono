import { el } from "./controls";

// A single "export result" window shown after every save attempt, so the user always knows the
// outcome (saved / shared / failed / needs-a-manual-save) and is offered a fallback when a format
// can't be delivered on their device. When an image is supplied it's shown as a compact `data:`
// URL <img> the user can long-press to save — the only reliable path in the restricted in-app
// WebViews of Facebook Messenger / Instagram, where downloads and the Share API dead-end. (Data
// URL, not blob:, because the WebView "Save image" menu can't resolve blob:.) Part of the
// "lychee hotfix".

const OVERLAY_MAX = 1440; // long edge for the long-press image — plenty on a phone, stays small

// Build a compact data: URL for the result. 1-bit output compresses tiny as PNG; if a recoloured
// or soft-screen image gets large, fall back to JPEG to stay under the WebView data-URL ceiling
// (~1–2 MB) where rendering silently breaks.
function toSafeDataURL(canvas: HTMLCanvasElement, prefer: "png" | "jpeg" = "png"): string {
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
  if (prefer === "jpeg") return src.toDataURL("image/jpeg", 0.9);
  let url = src.toDataURL("image/png");
  if (url.length > 1_400_000) url = src.toDataURL("image/jpeg", 0.9);
  return url;
}

export interface ResultAction {
  label: string;
  href?: string;          // renders an <a> (e.g. the intent:// escape hatch)
  onClick?: () => void;   // renders a <button>; the window closes first, then runs
  primary?: boolean;
}

export interface ExportResultOpts {
  title: string;                    // e.g. "SAVED", "SHARED", "EXPORT FAILED", "SAVE IMAGE"
  message?: string;                 // status detail
  image?: HTMLCanvasElement;        // if present, shown for long-press save
  imagePrefer?: "png" | "jpeg";
  actions?: ResultAction[];         // fallback buttons (e.g. "SAVE AS PNG", "OPEN IN CHROME")
}

export function openExportResult(opts: ExportResultOpts): void {
  const overlay = el("div", "modal-overlay");
  const panel = el("div", opts.image ? "modal save-modal" : "modal");
  const title = el("div", "modal-title");
  title.textContent = opts.title;

  const body = el("div", "modal-body");
  if (opts.message) {
    const msg = el("div", "save-hint");
    msg.textContent = opts.message;
    body.appendChild(msg);
  }
  if (opts.image) {
    const img = document.createElement("img");
    img.className = "save-img";
    img.alt = "Your edited image — long-press to save";
    img.src = toSafeDataURL(opts.image, opts.imagePrefer);
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
      b.addEventListener("click", () => { close(); a.onClick?.(); });
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

  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); close(); }
  }
}
