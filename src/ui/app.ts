import { store } from "../state/store";
import { FILTERS, getFilter } from "../filters/registry";
import { runPipeline } from "../engine/pipeline";
import { renderToCanvas, exportPNG, exportText } from "../io/render";
import { encodeGIF, downloadBlob, type GifFrame } from "../io/gif";
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
    const result = runPipeline(hi, store.stack, { time: animTime, frame: Math.round(animTime * store.fps) });
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
  const playBtn = btn("▶ PLAY", "", () => store.setPlaying(!store.playing));
  const gifBtn = btn("EXPORT GIF", "", () => exportGIF());
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
  headerRight.append(openBtn, playBtn, shareBtn, exportTxtBtn, gifBtn, exportBtn);

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
  function redraw(time = animTime) {
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
    const result = runPipeline(store.source, store.stack, { time, frame: Math.round(time * store.fps) });
    lastResult = result;
    exportTxtBtn.style.display = result.terminal?.text ? "" : "none";
    renderToCanvas(canvas, result);
  }

  // ---- animation clock (RAF) ----
  let animTime = 0;
  let rafId = 0;
  let startMs = 0;
  function tick(now: number) {
    if (!store.playing) return;
    if (!startMs) startMs = now;
    animTime = ((now - startMs) / 1000) % store.duration; // loop over the export duration
    redraw(animTime);
    rafId = requestAnimationFrame(tick);
  }
  function syncPlayback() {
    playBtn.textContent = store.playing ? "❚❚ PAUSE" : "▶ PLAY";
    if (store.playing && !rafId) {
      startMs = 0;
      rafId = requestAnimationFrame(tick);
    } else if (!store.playing && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      animTime = 0;
      redraw(0);
    }
  }

  // ---- GIF export: render the loop frame by frame ----
  async function exportGIF() {
    if (!store.source) return;
    const wasPlaying = store.playing;
    if (wasPlaying) store.setPlaying(false);
    const fps = store.fps;
    const count = Math.max(1, Math.round(store.duration * fps));
    const delayCs = Math.round(100 / fps);
    const off = document.createElement("canvas");
    const frames: GifFrame[] = [];
    let gw = 0;
    let gh = 0;
    gifBtn.textContent = "RENDERING…";
    await new Promise((r) => setTimeout(r, 0));
    for (let f = 0; f < count; f++) {
      const t = (f / fps) % store.duration;
      const result = runPipeline(store.source, store.stack, { time: t, frame: f });
      renderToCanvas(off, result);
      gw = off.width;
      gh = off.height;
      const data = off.getContext("2d")!.getImageData(0, 0, gw, gh).data;
      const indices = new Uint8Array(gw * gh);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) indices[j] = data[i]; // R=G=B (grey)
      frames.push({ indices, delayCs });
    }
    const blob = encodeGIF(frames, gw, gh);
    downloadBlob(blob, "mono.gif");
    gifBtn.textContent = "EXPORT GIF";
    if (wasPlaying) store.setPlaying(true);
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

    // animation panel
    const anim = el("section", "panel");
    anim.appendChild(heading("ANIMATION"));
    anim.appendChild(animRow("Duration (s)", store.duration, 0.5, 20, 0.5, (v) => store.setAnim("duration", v)));
    anim.appendChild(animRow("FPS", store.fps, 2, 30, 1, (v) => store.setAnim("fps", v)));
    const hint = el("p", "empty");
    hint.textContent = "Give Disruptors a Speed > 0, then Play / Export GIF.";
    anim.appendChild(hint);
    side.appendChild(anim);

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
    syncPlayback();
    if (!store.playing) redraw();
  });
  store.subscribeRender(() => {
    if (!store.playing) redraw();
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

function animRow(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
  const row = el("label", "ctl");
  const name = el("span", "ctl-label");
  name.textContent = label;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const val = el("span", "ctl-val");
  val.textContent = String(value);
  input.addEventListener("input", () => {
    val.textContent = input.value;
    onChange(parseFloat(input.value));
  });
  row.append(name, input, val);
  return row;
}

function heading(text: string): HTMLElement {
  const h = el("div", "phead");
  const span = el("span");
  span.textContent = text;
  h.appendChild(span);
  return h;
}
