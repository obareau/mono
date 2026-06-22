import { store } from "../state/store";
import { FILTERS, getFilter } from "../filters/registry";
import { runPipeline, runToVector, lastVectorIndex } from "../engine/pipeline";
import { renderToCanvas, exportPNG, exportText } from "../io/render";
import { sceneToSVG, sceneToPDF, downloadText, downloadBytes } from "../io/vector";
import { shareURL } from "../io/presets";
import type { PipelineResult } from "../engine/pipeline";
import { loadImageFile, fromBitmap } from "../io/loadImage";
import { buildControl, el } from "./controls";

// Renders the whole interface and keeps the canvas in sync with the store.
export function mountApp(root: HTMLElement): void {
  root.innerHTML = "";

  // ---- layout ----
  const header = el("header", "topbar");
  header.innerHTML = `<span class="logo">MONO<b>°</b></span><span class="tag">1-BIT IMAGE WORKBENCH</span>`;
  const headerRight = el("div", "topbar-right");
  header.appendChild(headerRight);

  const main = el("div", "layout");
  const stage = el("div", "stage");

  // canvas lives inside a classic Mac window (pinstripe title bar + close box)
  const win = el("div", "window");
  const winbar = el("div", "winbar");
  winbar.innerHTML = `<span class="close-box"></span><span class="win-title">untitled-1</span>`;
  const canvasWrap = el("div", "canvas-wrap");
  const canvas = document.createElement("canvas");
  canvas.className = "output";
  canvasWrap.appendChild(canvas);
  win.appendChild(winbar);
  win.appendChild(canvasWrap);
  stage.appendChild(win);

  const side = el("aside", "sidebar");

  main.appendChild(stage);
  main.appendChild(side);
  root.appendChild(header);
  root.appendChild(main);

  // ---- top bar actions ----
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (f) store.setSource(await loadImageFile(f));
  });
  root.appendChild(fileInput);

  let lastResult: PipelineResult | null = null;
  const openBtn = btn("OPEN IMAGE", "primary", () => fileInput.click());
  const exportBtn = btn("EXPORT PNG", "", () => exportPNGFull());

  // Re-run the stack at the source's native resolution (capped) for a print-quality PNG.
  const EXPORT_MAX = 4096;
  async function exportPNGFull() {
    const src = store.source;
    if (!src) return;
    if (!src.bitmap) {
      exportPNG(canvas, "mono.png"); // no original kept (shouldn't happen) — fall back to preview
      return;
    }
    exportBtn.textContent = "RENDERING…";
    await new Promise((r) => setTimeout(r, 0));
    const max = Math.min(EXPORT_MAX, Math.max(src.natW, src.natH));
    const hi = fromBitmap(src.bitmap, max);
    const result = runPipeline(hi, store.stack);
    const off = document.createElement("canvas");
    renderToCanvas(off, result);
    exportPNG(off, "mono.png");
    exportBtn.textContent = "EXPORT PNG";
  }
  const exportTxtBtn = btn("EXPORT TXT", "", () => {
    const t = lastResult?.terminal?.text?.();
    if (t) exportText(t, "mono.txt");
  });
  exportTxtBtn.style.display = "none"; // only when an ASCII (text) result is active

  // Vector export — re-runs the stack to the last vector-capable filter at native resolution.
  function exportVector(kind: "svg" | "pdf") {
    const src = store.source;
    if (!src) return;
    const hiSrc = src.bitmap ? fromBitmap(src.bitmap, Math.min(EXPORT_MAX, Math.max(src.natW, src.natH))) : src;
    const scene = runToVector(hiSrc, store.stack);
    if (!scene) return;
    if (kind === "svg") downloadText(sceneToSVG(scene), "mono.svg", "image/svg+xml");
    else downloadBytes(sceneToPDF(scene), "mono.pdf", "application/pdf");
  }
  const svgBtn = btn("EXPORT SVG", "", () => exportVector("svg"));
  const pdfBtn = btn("EXPORT PDF", "", () => exportVector("pdf"));
  svgBtn.style.display = "none";
  pdfBtn.style.display = "none";
  const shareBtn = btn("COPY LINK", "", async () => {
    const url = shareURL(store.serialize());
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = "COPIED ✓";
      setTimeout(() => (shareBtn.textContent = "COPY LINK"), 1200);
    } catch {
      shareBtn.textContent = "COPY LINK";
    }
  });
  headerRight.append(openBtn, shareBtn, exportTxtBtn, svgBtn, pdfBtn, exportBtn);

  // drag & drop + paste
  stage.addEventListener("dragover", (e) => {
    e.preventDefault();
    stage.classList.add("dragging");
  });
  stage.addEventListener("dragleave", () => stage.classList.remove("dragging"));
  stage.addEventListener("drop", async (e) => {
    e.preventDefault();
    stage.classList.remove("dragging");
    const f = e.dataTransfer?.files?.[0];
    if (f) store.setSource(await loadImageFile(f));
  });
  window.addEventListener("paste", async (e) => {
    const f = e.clipboardData?.files?.[0];
    if (f) store.setSource(await loadImageFile(f));
  });

  // ---- render ----
  function redraw() {
    if (!store.source) {
      canvas.width = 640;
      canvas.height = 400;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 640, 400);
      ctx.fillStyle = "#999";
      ctx.font = '14px "SFMono-Regular", Menlo, monospace';
      ctx.textAlign = "center";
      ctx.fillText("DROP · PASTE · OPEN AN IMAGE", 320, 200);
      return;
    }
    const result = runPipeline(store.source, store.stack);
    lastResult = result;
    exportTxtBtn.style.display = result.terminal?.text ? "" : "none";
    const hasVector = lastVectorIndex(store.stack) >= 0;
    svgBtn.style.display = hasVector ? "" : "none";
    pdfBtn.style.display = hasVector ? "" : "none";
    renderToCanvas(canvas, result);
  }

  function renderSidebar() {
    side.innerHTML = "";

    // filter palette
    const palette = el("section", "panel");
    palette.appendChild(heading("ADD FILTER"));
    const grid = el("div", "palette");
    for (const f of FILTERS) {
      const b = btn(f.name.toUpperCase(), "chip", () => store.addFilter(f.id));
      b.dataset.cat = f.category;
      grid.appendChild(b);
    }
    palette.appendChild(grid);
    side.appendChild(palette);

    // active stack
    const stackPanel = el("section", "panel");
    const h = heading(`STACK · ${store.stack.length}`);
    if (store.stack.length) {
      const clear = btn("CLEAR", "mini", () => store.clear());
      h.appendChild(clear);
    }
    stackPanel.appendChild(h);

    if (!store.stack.length) {
      const empty = el("p", "empty");
      empty.textContent = "No filters. Add one above — they apply top to bottom.";
      stackPanel.appendChild(empty);
    }

    store.stack.forEach((item, idx) => {
      const f = getFilter(item.filterId)!;
      const card = el("div", "fcard");
      if (!item.enabled) card.classList.add("off");
      if (f.terminal) card.classList.add("terminal");

      const bar = el("div", "fcard-bar");
      const title = el("span", "fcard-title");
      title.innerHTML = `<i>${String(idx + 1).padStart(2, "0")}</i> ${f.name}`;
      bar.appendChild(title);

      const tools = el("div", "fcard-tools");
      tools.append(
        iconBtn("↑", "Move up", () => store.move(item.uid, -1)),
        iconBtn("↓", "Move down", () => store.move(item.uid, 1)),
        iconBtn(item.enabled ? "●" : "○", "Toggle", () => store.toggleFilter(item.uid)),
        iconBtn("✕", "Remove", () => store.removeFilter(item.uid)),
      );
      bar.appendChild(tools);
      card.appendChild(bar);

      const body = el("div", "fcard-body");
      for (const def of f.params) body.appendChild(buildControl(item, def));
      card.appendChild(body);
      stackPanel.appendChild(card);
    });

    side.appendChild(stackPanel);
  }

  store.subscribe(() => {
    renderSidebar();
    redraw();
  });
  store.subscribeRender(() => redraw());

  renderSidebar();
  redraw();
}

function btn(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = `btn ${cls}`.trim();
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function iconBtn(glyph: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "ibtn";
  b.textContent = glyph;
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

function heading(text: string): HTMLElement {
  const h = el("div", "phead");
  const span = el("span");
  span.textContent = text;
  h.appendChild(span);
  return h;
}
