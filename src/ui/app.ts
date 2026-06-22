import { store } from "../state/store";
import { FILTERS, getFilter } from "../filters/registry";
import { runPipeline } from "../engine/pipeline";
import { renderToCanvas, exportPNG, exportText } from "../io/render";
import type { PipelineResult } from "../engine/pipeline";
import { loadImageFile } from "../io/loadImage";
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
  const canvasWrap = el("div", "canvas-wrap");
  const canvas = document.createElement("canvas");
  canvas.className = "output";
  canvasWrap.appendChild(canvas);
  stage.appendChild(canvasWrap);

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
  const exportBtn = btn("EXPORT PNG", "", () => exportPNG(canvas, "mono.png"));
  const exportTxtBtn = btn("EXPORT TXT", "", () => {
    const t = lastResult?.terminal?.text?.();
    if (t) exportText(t, "mono.txt");
  });
  exportTxtBtn.style.display = "none"; // only when an ASCII (text) result is active
  headerRight.append(openBtn, exportTxtBtn, exportBtn);

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

  // ---- render loop ----
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
    const result = runPipeline(store.source.gray, store.source.w, store.source.h, store.stack);
    lastResult = result;
    exportTxtBtn.style.display = result.terminal?.text ? "" : "none";
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
